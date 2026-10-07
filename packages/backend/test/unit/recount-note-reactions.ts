/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import pg from 'pg';
import { parseOptions, recountNoteReactions } from '../../scripts/recount_note_reactions.mjs';
import { loadConfig } from '@/config.js';

describe('historical reaction recount', () => {
	const config = loadConfig();
	const client = new pg.Client({
		host: config.db.host,
		port: config.db.port,
		user: config.db.user,
		password: config.db.pass,
		database: config.db.db,
	});
	const exists = vi.fn().mockResolvedValue(0);
	const redis = { exists };
	let directory: string;
	const initial = { '😍': 5, ':dacall:': 3, '😀': 2, '🤙': 1, '👍': 9 };
	const expected = { '😍': 10, ':dacall:': 4, '😀': 1, '🤙': 3 };
	const reactions = [...Array<string>(10).fill('😍'), ...Array<string>(4).fill(':dacall:'), '😀', ...Array<string>(3).fill('🤙')];
	const pairs = reactions.map((reaction, i) => `user${i}/${reaction}`).reverse().slice(0, 16);
	const applyOptions = () => ({ apply: true, maintenance: true, backupPath: join(directory, 'before.json'), cacheLimit: 16 });

	beforeAll(async () => {
		directory = await mkdtemp(join(tmpdir(), 'misskey-recount-test-'));
		await client.connect();
		await client.query('CREATE TEMPORARY TABLE note (id varchar PRIMARY KEY, reactions jsonb NOT NULL, "reactionAndUserPairCache" varchar[] NOT NULL, "userHost" varchar)');
		await client.query('CREATE TEMPORARY TABLE note_reaction (id varchar PRIMARY KEY, "noteId" varchar NOT NULL, "userId" varchar NOT NULL, reaction varchar NOT NULL)');
	});

	beforeEach(async () => {
		await client.query('TRUNCATE note, note_reaction');
		await client.query('INSERT INTO note (id, reactions, "reactionAndUserPairCache") VALUES ($1, $2::jsonb, $3::varchar[]), ($4, $5::jsonb, $6::varchar[])', ['target', JSON.stringify(initial), ['stale/👍'], 'other', '{"❤":99}', []]);
		for (const [i, reaction] of reactions.entries()) {
			await client.query('INSERT INTO note_reaction VALUES ($1, $2, $3, $4)', [`reaction${i.toString().padStart(2, '0')}`, 'target', `user${i}`, reaction]);
		}
		exists.mockReset().mockResolvedValue(0);
		await rm(join(directory, 'before.json'), { force: true });
	});

	afterAll(async () => {
		await client.end();
		if (directory) await rm(directory, { recursive: true, force: true });
	});

	test('requires explicit note IDs and maintenance mode for writes', () => {
		expect(() => parseOptions([])).toThrow('note-id');
		expect(() => parseOptions(['--note-id', 'target', '--apply'])).toThrow('maintenance');
		expect(() => parseOptions(['--all'])).toThrow();
		expect(parseOptions(['--note-id', 'target', '--note-id', 'target']).noteIds).toEqual(['target']);
	});

	test('reports real counts without writing and keeps local custom emoji keys', async () => {
		const result = await recountNoteReactions(client, redis, ['target'], { cacheLimit: 16 });
		expect(result).toEqual({ applied: false, pendingBuffers: 0, notes: [{ id: 'target', before: initial, after: expected, cachedUsers: 16 }] });
		expect((await client.query('SELECT reactions FROM note WHERE id = $1', ['target'])).rows[0].reactions).toEqual(initial);
		expect(exists).toHaveBeenCalledWith('reactionsBufferDeltas:target', 'reactionsBufferPairs:target');
	});

	test('repairs only the target, backs up original values and can be repeated without double counting', async () => {
		const options = applyOptions();
		await recountNoteReactions(client, redis, ['target'], options);
		const note = (await client.query('SELECT * FROM note WHERE id = $1', ['target'])).rows[0];
		expect(note.reactions).toEqual(expected);
		expect(note.reactionAndUserPairCache).toEqual(pairs);
		expect((await client.query('SELECT reactions FROM note WHERE id = $1', ['other'])).rows[0].reactions).toEqual({ '❤': 99 });
		const backup = JSON.parse(await readFile(options.backupPath, 'utf8'));
		expect(backup.notes[0]).toEqual({ id: 'target', userHost: null, reactions: initial, reactionAndUserPairCache: ['stale/👍'] });
		expect((await stat(options.backupPath)).mode & 0o777).toBe(0o600);
		await recountNoteReactions(client, redis, ['target'], { ...options, backupPath: join(directory, 'again.json') });
		expect((await client.query('SELECT reactions FROM note WHERE id = $1', ['target'])).rows[0].reactions).toEqual(expected);
		expect((await client.query('SELECT count(*)::int AS total FROM note_reaction')).rows[0].total).toBe(18);
	});

	test('clears stale aggregates and cached users when there are no reaction rows', async () => {
		await client.query('DELETE FROM note_reaction');
		await recountNoteReactions(client, redis, ['target'], applyOptions());
		const note = (await client.query('SELECT * FROM note WHERE id = $1', ['target'])).rows[0];
		expect(note.reactions).toEqual({});
		expect(note.reactionAndUserPairCache).toEqual([]);
	});

	test('does not partially repair when a requested note does not exist', async () => {
		await expect(recountNoteReactions(client, redis, ['target', 'missing'], applyOptions())).rejects.toThrow('do not exist');
		expect((await client.query('SELECT reactions FROM note WHERE id = $1', ['target'])).rows[0].reactions).toEqual(initial);
	});

	test('refuses pending buffers without clearing Redis or changing PostgreSQL', async () => {
		exists.mockResolvedValue(1);
		await expect(recountNoteReactions(client, redis, ['target'], applyOptions())).rejects.toThrow('Pending reaction buffers');
		expect((await client.query('SELECT reactions FROM note WHERE id = $1', ['target'])).rows[0].reactions).toEqual(initial);
	});

	test('refuses remote notes whose reaction records may be incomplete', async () => {
		await client.query('UPDATE note SET "userHost" = $1 WHERE id = $2', ['remote.example', 'target']);
		await expect(recountNoteReactions(client, redis, ['target'], applyOptions())).rejects.toThrow('Only local notes');
		expect((await client.query('SELECT reactions FROM note WHERE id = $1', ['target'])).rows[0].reactions).toEqual(initial);
	});

	test('rolls back if buffers reappear before commit', async () => {
		exists.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
		await expect(recountNoteReactions(client, redis, ['target'], applyOptions())).rejects.toThrow('rolled back');
		expect((await client.query('SELECT reactions FROM note WHERE id = $1', ['target'])).rows[0].reactions).toEqual(initial);
	});

	test('does not overwrite an existing backup or change the database if backup creation fails', async () => {
		const options = applyOptions();
		await writeFile(options.backupPath, 'existing backup');
		await expect(recountNoteReactions(client, redis, ['target'], options)).rejects.toThrow();
		expect(await readFile(options.backupPath, 'utf8')).toBe('existing backup');
		expect((await client.query('SELECT reactions FROM note WHERE id = $1', ['target'])).rows[0].reactions).toEqual(initial);
	});
});
