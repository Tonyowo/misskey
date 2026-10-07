/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import WebSocket from 'ws';
import { Redis } from 'ioredis';
import { loadConfig } from '@/config.js';
import { IdService } from '@/core/IdService.js';
import { MiUser } from '@/models/User.js';
import type { DataSource } from 'typeorm';
import type * as Misskey from 'misskey-js';
import { api, castAsError, initTestDb, post, signup, uploadFile, port } from '../utils.js';
import { MiNote } from '@/models/Note.js';
import { MiNoteRevision } from '@/models/NoteRevision.js';

describe('community upgrade', () => {
	let db: DataSource;
	let redis: Redis;
	let rootUser: Misskey.entities.SignupResponse;
	const idService = new IdService(loadConfig());
	let alice: Misskey.entities.SignupResponse;
	let bob: Misskey.entities.SignupResponse;
	beforeAll(async () => {
		db = await initTestDb(true);
		rootUser = await signup({ username: 'root' });
		redis = new Redis(loadConfig().redis);
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
	});

	afterAll(async () => { await redis.quit(); await db.destroy(); });

	test('repeated HTTP deletion changes the author count only once', async () => {
		const author = await signup();
		await post(author, { text: 'keep' });
		const note = await post(author, { text: 'delete', localOnly: true });
		const before = await db.getRepository(MiUser).findOneByOrFail({ id: author.id });
		const responses = await Promise.all([api('notes/delete', { noteId: note.id }, author), api('notes/delete', { noteId: note.id }, author)]);
		expect(responses.some(response => response.status === 204)).toBe(true);
		expect(responses.every(response => [204, 400].includes(response.status))).toBe(true);
		const after = await db.getRepository(MiUser).findOneByOrFail({ id: author.id });
		expect(after.notesCount).toBe(before.notesCount - 1);
	});

	test('patch preserves audience, files and reply target; no-op does not create history', async () => {
		const parent = await post(alice, { text: 'parent' });
		const note = await post(alice, { text: 'before', visibility: 'home', replyId: parent.id, localOnly: true });
		const first = await api('notes/update', { noteId: note.id, updateMode: 'patch', expectedRevision: 0, text: 'after' }, alice);
		expect(first.status).toBe(200);
		expect(first.body.updatedNote).toMatchObject({ id: note.id, revision: 1, replyId: parent.id, visibility: 'home', localOnly: true });
		const noOp = await api('notes/update', { noteId: note.id, updateMode: 'patch', expectedRevision: 1, text: 'after' }, alice);
		expect(noOp.status).toBe(200);
		const history = await api('notes/history', { noteId: note.id }, alice);
		expect(history.body.map(version => version.revision)).toEqual([1, 0]);
		expect(history.body.map(version => version.note.text)).toEqual(['after', 'before']);
	});

	test('concurrent edits have one winner and retain exactly one new revision', async () => {
		const note = await post(alice, { text: 'before' });
		const results = await Promise.all(['one', 'two'].map(text => api('notes/update', { noteId: note.id, updateMode: 'patch', expectedRevision: 0, text }, alice)));
		expect(results.map(result => result.status).sort()).toEqual([200, 400]);
		const conflict = results.find(result => result.status !== 200)!;
		expect(castAsError(conflict.body).error.code).toBe('NOTE_VERSION_CONFLICT');
		expect(await db.getRepository(MiNoteRevision).countBy({ noteId: note.id })).toBe(2);
	});

	test('revision and post changes roll back together when snapshot insertion fails', async () => {
		const note = await post(alice, { text: 'before' });
		await db.query(`CREATE FUNCTION fail_revision_insert() RETURNS trigger AS $$ BEGIN IF NEW.revision = 1 AND NEW.snapshot->>'text' = 'rollback' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
		await db.query(`CREATE TRIGGER fail_revision BEFORE INSERT ON note_revision FOR EACH ROW EXECUTE FUNCTION fail_revision_insert()`);
		try {
			const result = await api('notes/update', { noteId: note.id, updateMode: 'patch', text: 'rollback' }, alice);
			expect(result.status).toBe(500);
			expect(await db.getRepository(MiNoteRevision).countBy({ noteId: note.id })).toBe(0);
			expect(await db.getRepository(MiNote).findOneBy({ id: note.id })).toMatchObject({ text: 'before', revision: 0 });
		} finally {
			await db.query('DROP TRIGGER fail_revision ON note_revision');
			await db.query('DROP FUNCTION fail_revision_insert()');
		}
	});

	test('historical hidden blocks stay author-only, even after viewer comments', async () => {
		const note = await post(alice, { text: 'public $[replyVisible secret-before]' });
		await api('notes/update', { noteId: note.id, updateMode: 'patch', text: 'public $[replyVisible secret-after]' }, alice);
		const reply = await post(bob, { text: 'comment', replyId: note.id });
		const visible = await api('notes/show', { noteId: note.id }, bob);
		expect(visible.body.text).toContain('secret-after');
		const history = await api('notes/history', { noteId: note.id }, bob);
		expect(JSON.stringify(history.body)).not.toContain('secret-');
		const authorHistory = await api('notes/history', { noteId: note.id }, alice);
		expect(JSON.stringify(authorHistory.body)).toContain('secret-before');
		await api('notes/delete', { noteId: reply.id }, bob);
		const revoked = await api('notes/show', { noteId: note.id }, bob);
		expect(revoked.body.text).not.toContain('secret-after');
	});

	test('private history and deleted histories are unavailable', async () => {
		const note = await post(alice, { text: 'private', visibility: 'specified', visibleUserIds: [] });
		await api('notes/update', { noteId: note.id, updateMode: 'patch', text: 'private edited' }, alice);
		expect((await api('notes/history', { noteId: note.id }, bob)).status).toBe(400);
		await api('notes/delete', { noteId: note.id }, alice);
		expect(await db.getRepository(MiNoteRevision).countBy({ noteId: note.id })).toBe(0);
	});

	test('thread pagination preserves targets and excludes quotes and invisible paths', async () => {
		const root = await post(alice, { text: 'root' });
		const first = await post(alice, { text: 'first', replyId: root.id });
		const second = await post(alice, { text: 'second', replyId: first.id });
		const third = await post(bob, { text: 'third', replyId: second.id });
		await post(alice, { text: 'quote', renoteId: first.id });
		const hidden = await post(alice, { text: 'hidden', replyId: first.id, visibility: 'specified', visibleUserIds: [] });
		const bridged = await post(alice, { text: 'unreachable', replyId: first.id });
		await db.getRepository(MiNote).update(bridged.id, { replyId: hidden.id });
		const firstPage = await api('notes/replies-thread', { noteId: first.id, limit: 1 }, bob);
		expect(firstPage.status).toBe(200);
		expect(firstPage.body.items[0].id).toBe(third.id);
		expect(firstPage.body.hasMore).toBe(true);
		const next = await api('notes/replies-thread', { noteId: first.id, limit: 10, untilId: firstPage.body.nextCursor! }, bob);
		expect(next.body.items.map(item => item.id)).toEqual([second.id]);
		expect(JSON.stringify([firstPage.body, next.body])).not.toContain(bridged.id);
	});
	test('history pagination follows revision order even when record IDs are reversed', async () => {
		const note = await post(alice, { text: 'first' });
		await api('notes/update', { noteId: note.id, updateMode: 'patch', text: 'second' }, alice);
		const versions = await db.getRepository(MiNoteRevision).findBy({ noteId: note.id });
		const baseline = versions.find(item => item.revision === 0)!;
		const edited = versions.find(item => item.revision === 1)!;
		const ids = [baseline.id, edited.id].sort();
		await db.getRepository(MiNoteRevision).update(baseline.id, { id: idService.gen(Date.now() - 10000) });
		await db.getRepository(MiNoteRevision).update(edited.id, { id: ids[0] });
		await db.getRepository(MiNoteRevision).update({ noteId: note.id, revision: 0 }, { id: ids[1] });
		const first = await api('notes/history', { noteId: note.id, limit: 1 }, alice);
		expect(first.body[0].revision).toBe(1);
		const next = await api('notes/history', { noteId: note.id, limit: 1, untilId: first.body[0].id }, alice);
		expect(next.body[0].revision).toBe(0);
	});

	test('historical file references stay associated and missing files do not block patching', async () => {
		const uploaded = await uploadFile(alice);
		expect(uploaded.status).toBe(200);
		const fileId = uploaded.body!.id;
		const note = await post(alice, { text: 'with file', fileIds: [fileId] });
		expect((await api('notes/update', { noteId: note.id, updateMode: 'patch', fileIds: [] }, alice)).status).toBe(200);
		const attached = await api('drive/files/attached-notes', { fileId }, alice);
		expect(attached.body.some(item => item.id === note.id)).toBe(true);
		await api('notes/update', { noteId: note.id, updateMode: 'patch', fileIds: [fileId] }, alice);
		await api('drive/files/delete', { fileId }, alice);
		const beforePatch = await db.getRepository(MiNote).findOneByOrFail({ id: note.id });
		expect((await api('notes/update', { noteId: note.id, updateMode: 'patch' }, alice)).status).toBe(200);
		expect(await db.getRepository(MiNote).findOneByOrFail({ id: note.id })).toMatchObject({ revision: beforePatch.revision, updatedAt: beforePatch.updatedAt });
		expect((await api('notes/update', { noteId: note.id, updateMode: 'patch', text: 'missing file retained' }, alice)).status).toBe(200);
	});

	test('author content policies prune invisible nodes before reaching their descendants', async () => {
		const root = await post(bob, { text: 'policy root' });
		const privateNode = await post(alice, { text: 'policy node', replyId: root.id });
		const descendant = await post(bob, { text: 'descendant', replyId: privateNode.id });
		const repository = db.getRepository(MiUser);
		try {
			await repository.update(alice.id, { requireSigninToViewContents: true });
			const anonymous = await api('notes/replies-thread', { noteId: root.id });
			expect(anonymous.status).toBe(200);
			expect(anonymous.body.items).toEqual([]);
			await repository.update(alice.id, { requireSigninToViewContents: false, makeNotesHiddenBefore: Math.floor(Date.now() / 1000) + 60 });
			expect((await api('notes/replies-thread', { noteId: root.id }, bob)).body.items).toEqual([]);
		} finally { await repository.update(alice.id, { requireSigninToViewContents: false, makeNotesHiddenBefore: null }); }
		expect((await api('notes/replies-thread', { noteId: root.id }, bob)).body.items.some(item => item.id === descendant.id)).toBe(true);
	});

	test('partial reads are owner-scoped, idempotent, bounded and consistent with grouped notifications', async () => {
		await api('notifications/flush', {}, alice);
		await api('notifications/flush', {}, bob);
		const note = await post(alice, { text: 'notification source' });
		const ownIds = [idService.gen(), idService.gen(), idService.gen()];
		const otherId = idService.gen();
		for (const id of ownIds) await redis.xadd(`notificationTimeline:${alice.id}`, '*', 'data', JSON.stringify({ id, createdAt: new Date().toISOString(), type: 'reaction', notifierId: bob.id, noteId: note.id, reaction: '❤' }));
		await redis.xadd(`notificationTimeline:${bob.id}`, '*', 'data', JSON.stringify({ id: otherId, createdAt: new Date().toISOString(), type: 'test' }));
		const first = await api('notifications/read', { notificationIds: [ownIds[0], otherId] }, alice);
		expect(first.body.unreadCount).toBe(2);
		expect((await api('notifications/read', { notificationIds: [ownIds[0]] }, alice)).body.unreadCount).toBe(2);
		expect(await redis.smembers(`seenNotifications:${alice.id}`)).toEqual([ownIds[0]]);
		const grouped = await api('i/notifications-grouped', { markAsRead: false }, alice);
		expect(grouped.body[0].isRead).toBe(false);
		await Promise.all([api('notifications/read', { notificationIds: ownIds.slice(1) }, alice), api('notifications/mark-all-as-read', {}, alice)]);
		expect((await api('i/notifications-grouped', { markAsRead: false }, alice)).body[0].isRead).toBe(true);
		expect((await api('i/notifications', { markAsRead: false }, bob)).body[0].isRead).toBe(false);
		await redis.sadd(`seenNotifications:${alice.id}`, 'expired-id');
		await redis.xtrim(`notificationTimeline:${alice.id}`, 'MAXLEN', 1);
		await api('i/notifications', { markAsRead: false }, alice);
		expect(await redis.smembers(`seenNotifications:${alice.id}`)).not.toContain('expired-id');
	});

	test('report resolution notifies the reporter once without internal report details', async () => {
		await api('notifications/flush', {}, alice);
		await api('users/report-abuse', { userId: bob.id, comment: 'private-report-details' }, alice);
		const reports = await api('admin/abuse-user-reports', {}, rootUser);
		const report = reports.body.find(item => item.comment === 'private-report-details')!;
		await Promise.all([api('admin/resolve-abuse-user-report', { reportId: report.id, resolvedAs: 'accept' }, rootUser), api('admin/resolve-abuse-user-report', { reportId: report.id, resolvedAs: 'reject' }, rootUser)]);
		await api('admin/resolve-abuse-user-report', { reportId: report.id }, rootUser);
		await expect.poll(async () => (await api('i/notifications', { markAsRead: false }, alice)).body.filter(item => item.type === 'abuseReportResolved').length).toBe(1);
		const notifications = await api('i/notifications', { markAsRead: false }, alice);
		expect(JSON.stringify(notifications.body)).not.toContain('private-report-details');
		expect(JSON.stringify(notifications.body)).not.toContain(report.id);
	});

	test('updated streams pack hidden content for each viewer and revoke a deleted direct comment', async () => {
		const carol = await signup({ username: 'stream-carol' });
		const note = await post(alice, { text: 'public $[replyVisible stream-secret-before]' });
		const direct = await post(bob, { text: 'unlock', replyId: note.id });
		await post(carol, { text: 'reply to comment', replyId: direct.id });
		const viewers = [alice.token, bob.token, carol.token, ''];
		const sockets: WebSocket[] = [];
		const updates: Misskey.entities.Note[][] = viewers.map(() => []);
		try {
			for (const [index, token] of viewers.entries()) {
				const socket = new WebSocket(`ws://127.0.0.1:${port}/streaming${token ? `?i=${token}` : ''}`);
				sockets.push(socket);
				socket.on('message', data => {
					const message = JSON.parse(data.toString());
					if (message.type === 'noteUpdated' && message.body.id === note.id && message.body.type === 'updated') updates[index].push(message.body.body);
				});
				await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
				socket.send(JSON.stringify({ type: 'subNote', body: { id: note.id } }));
				await new Promise<void>(resolve => { socket.once('pong', () => resolve()); socket.ping(); });
			}
			await api('notes/update', { noteId: note.id, updateMode: 'patch', text: 'public $[replyVisible stream-secret-after]' }, alice);
			await expect.poll(() => updates.every(items => items.length > 0)).toBe(true);
			expect(updates[0].at(-1)!.text).toContain('stream-secret-after');
			expect(updates[1].at(-1)!.text).toContain('stream-secret-after');
			expect(JSON.stringify(updates.slice(2))).not.toContain('stream-secret-');
			updates[1] = [];
			await api('notes/delete', { noteId: direct.id }, bob);
			await expect.poll(() => updates[1].length).toBeGreaterThan(0);
			expect(JSON.stringify(updates[1])).not.toContain('stream-secret-');
		} finally { for (const socket of sockets) socket.close(); }
	});

	test('large threads and histories stay paginated with a bounded response', async () => {
		const root = await post(alice, { text: 'performance root' });
		const source = await db.getRepository(MiNote).findOneByOrFail({ id: root.id });
		const notes = Array.from({ length: 1000 }, () => ({ ...source, id: idService.gen(), replyId: root.id, replyUserId: alice.id, repliesCount: 0 }));
		await db.getRepository(MiNote).insert(notes);
		await db.getRepository(MiNoteRevision).insert(Array.from({ length: 100 }, (_, revision) => ({
			id: idService.gen(), noteId: root.id, revision, schemaVersion: 1, createdAt: new Date(),
			snapshot: { text: `version ${revision}`, cw: null, fileIds: [], reactionAcceptance: null, replyVisibleContents: [] },
		})));
		const timings: Record<string, number[]> = { baselineReplies: [], repliesThread: [], history: [] };
		for (let sample = 0; sample < 10; sample++) {
			for (const key of Object.keys(timings)) {
				const start = performance.now();
				if (key === 'baselineReplies') {
					const result = await api('notes/replies', { noteId: root.id, limit: 20 }, bob);
					expect(result.body.length).toBe(20);
				} else if (key === 'repliesThread') {
					const result = await api('notes/replies-thread', { noteId: root.id, limit: 20 }, bob);
					expect(result.body.items.length).toBe(20);
					expect(result.body.hasMore).toBe(true);
				} else {
					const result = await api('notes/history', { noteId: root.id, limit: 20 }, bob);
					expect(result.body.length).toBe(20);
					expect(result.body[0].revision).toBe(99);
				}
				timings[key].push(Math.round((performance.now() - start) * 100) / 100);
			}
		}
		process.stdout.write(`COMMUNITY_PERFORMANCE ${JSON.stringify(timings)}\n`);
	});

});
