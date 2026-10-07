/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import type { TestingModule } from '@nestjs/testing';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalModule } from '@/GlobalModule.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { ChatService } from '@/core/ChatService.js';
import { EmailService } from '@/core/EmailService.js';
import { SignupService } from '@/core/SignupService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { findVerifiedLocalEmailProfile } from '@/misc/account-email.js';
import VerifyEmailEndpoint from '@/server/api/endpoints/verify-email.js';
import ResetPasswordEndpoint from '@/server/api/endpoints/request-reset-password.js';
import UpdateEmailEndpoint from '@/server/api/endpoints/i/update-email.js';
import type { MiLocalUser } from '@/models/User.js';
import type { ChatRoomMembershipsRepository, ChatRoomsRepository, NotesRepository, PasswordResetRequestsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';

describe('community consistency with PostgreSQL transactions', () => {
	let app: TestingModule;
	let users: UsersRepository;
	let profiles: UserProfilesRepository;
	let notes: NotesRepository;
	let rooms: ChatRoomsRepository;
	let members: ChatRoomMembershipsRepository;
	let resets: PasswordResetRequestsRepository;
	let ids: IdService;
	let chat: ChatService;
	let email: EmailService;
	let verify: VerifyEmailEndpoint;
	let reset: ResetPasswordEndpoint;

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
			providers: [VerifyEmailEndpoint, ResetPasswordEndpoint, UpdateEmailEndpoint],
		}).compile();
		await app.init();
		users = app.get(DI.usersRepository);
		profiles = app.get(DI.userProfilesRepository);
		notes = app.get(DI.notesRepository);
		rooms = app.get(DI.chatRoomsRepository);
		members = app.get(DI.chatRoomMembershipsRepository);
		resets = app.get(DI.passwordResetRequestsRepository);
		ids = app.get(IdService);
		chat = app.get(ChatService);
		email = app.get(EmailService);
		verify = app.get(VerifyEmailEndpoint);
		reset = app.get(ResetPasswordEndpoint);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await users.createQueryBuilder().delete().execute();
	});
	afterAll(async () => { await app.close(); });

	async function createUser(emailAddress?: string, verified = true) {
		const id = ids.gen();
		const user = await users.save({ id, username: `u${id}`, usernameLower: `u${id}`, host: null, notesCount: 10 });
		await profiles.save({ userId: id, email: emailAddress ?? null, emailVerified: verified });
		return user;
	}

	async function createRoom() {
		const [owner, b, c] = await Promise.all([createUser(), createUser(), createUser()]);
		const room = await rooms.save({ id: ids.gen(), name: 'consistency', ownerId: owner.id });
		await members.save([b, c].map(user => ({ id: ids.gen(), roomId: room.id, userId: user.id, role: 'member' as const })));
		return { owner, b, c, room };
	}

	test('concurrent deletion decrements author and parent counts once and emits one event', async () => {
		const author = await createUser();
		const parent = await notes.save({ id: ids.gen(), userId: author.id, text: 'parent', visibility: 'public', repliesCount: 1, localOnly: true });
		const reply = await notes.save({ id: ids.gen(), userId: author.id, text: 'reply', visibility: 'public', replyId: parent.id, localOnly: true });
		const events = vi.spyOn(app.get(GlobalEventService), 'publishNoteStream');
		const service = app.get(NoteDeleteService);
		await Promise.all([service.delete(author, reply), service.delete(author, reply)]);
		expect(await notes.existsBy({ id: reply.id })).toBe(false);
		expect((await users.findOneByOrFail({ id: author.id })).notesCount).toBe(9);
		expect((await notes.findOneByOrFail({ id: parent.id })).repliesCount).toBe(0);
		expect(events.mock.calls.filter(call => call[1] === 'deleted')).toHaveLength(1);
		await service.delete(author, reply, true);
		expect((await users.findOneByOrFail({ id: author.id })).notesCount).toBe(9);
	});

	test('a failed counter update rolls deletion back', async () => {
		const author = await createUser();
		const note = await notes.save({ id: ids.gen(), userId: author.id, text: 'rollback', visibility: 'public', localOnly: true });
		await users.query('ALTER TABLE "user" ADD CONSTRAINT test_note_count CHECK ("notesCount" >= 10) NOT VALID');
		try {
			await expect(app.get(NoteDeleteService).delete(author, note, true)).rejects.toThrow();
			expect(await notes.existsBy({ id: note.id })).toBe(true);
			expect((await users.findOneByOrFail({ id: author.id })).notesCount).toBe(10);
		} finally {
			await users.query('ALTER TABLE "user" DROP CONSTRAINT test_note_count');
		}
	});

	test('only one concurrent ownership transfer succeeds and all users retain membership', async () => {
		const { owner, b, c, room } = await createRoom();
		const results = await Promise.allSettled([
			chat.transferRoomOwner(owner.id, room.id, b.id),
			chat.transferRoomOwner(owner.id, room.id, c.id),
		]);
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		const updated = await rooms.findOneByOrFail({ id: room.id });
		const memberships = await members.findBy({ roomId: room.id });
		expect(new Set([updated.ownerId, ...memberships.map(member => member.userId)])).toEqual(new Set([owner.id, b.id, c.id]));
		expect(memberships.find(member => member.userId === owner.id)?.role).toBe('admin');
		expect(memberships.some(member => member.userId === updated.ownerId)).toBe(false);
		await expect(chat.transferRoomOwner(owner.id, room.id, owner.id)).rejects.toThrow('forbidden');
	});

	test.each(['leave', 'kick', 'ban'] as const)('transfer and %s cannot remove the newly appointed owner', async operation => {
		const { owner, b, room } = await createRoom();
		const remove = () => operation === 'leave' ? chat.leaveRoom(b.id, room.id)
			: operation === 'kick' ? chat.kickRoomMember(owner.id, room.id, b.id)
				: chat.banRoomMember(owner.id, room.id, b.id);
		const results = await Promise.allSettled([chat.transferRoomOwner(owner.id, room.id, b.id), remove()]);
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		const updated = await rooms.findOneByOrFail({ id: room.id });
		expect([owner.id, b.id]).toContain(updated.ownerId);
		expect(await members.existsBy({ roomId: room.id, userId: b.id })).toBe(false);
		if (updated.ownerId === b.id) {
			expect(await members.existsBy({ roomId: room.id, userId: owner.id })).toBe(true);
		}
	});

	test('legacy mixed-case email resolves and blocks duplicate registration', async () => {
		const user = await createUser(' Alice@Example.COM ');
		expect((await findVerifiedLocalEmailProfile(profiles, 'alice@example.com'))?.userId).toBe(user.id);
		expect(await email.validateEmailForAccount(' ALICE@example.com ')).toEqual({ available: false, reason: 'used' });
	});

	test.each(['kick', 'ban'] as const)('concurrent administrator %s operations use the transaction connection', async operation => {
		const { b: admin, room } = await createRoom();
		await members.update({ roomId: room.id, userId: admin.id }, { role: 'admin' });
		const targets = await Promise.all(Array.from({ length: 12 }, () => createUser()));
		await members.save(targets.map(user => ({ id: ids.gen(), roomId: room.id, userId: user.id, role: 'member' as const })));
		await Promise.all(targets.map(user => operation === 'kick'
			? chat.kickRoomMember(admin.id, room.id, user.id)
			: chat.banRoomMember(admin.id, room.id, user.id)));
		expect(await members.countBy({ roomId: room.id })).toBe(2);
	});

	test('password recovery accepts mixed case and sends only to the stored address', async () => {
		const user = await createUser('Alice@Example.COM');
		const send = vi.spyOn(email, 'sendEmail').mockResolvedValue();
		await reset.exec({ email: ' ALICE@example.com ' }, null, null);
		expect(await resets.countBy({ userId: user.id })).toBe(1);
		expect(send).toHaveBeenCalledOnce();
		expect(send.mock.calls[0][0]).toBe('Alice@Example.COM');
	});

	test('legacy collisions resolve to no account and create no reset requests', async () => {
		await createUser('Alice@Example.COM');
		await createUser('alice@example.com');
		const send = vi.spyOn(email, 'sendEmail').mockResolvedValue();
		expect(await findVerifiedLocalEmailProfile(profiles, 'Alice@Example.COM')).toBeNull();
		await reset.exec({ email: 'alice@example.com' }, null, null);
		expect(await resets.count()).toBe(0);
		expect(send).not.toHaveBeenCalled();
	});

	test('concurrent verification claims normalize the address and allow one owner', async () => {
		const a = await createUser('Claim@Example.COM', false);
		const b = await createUser('claim@example.com', false);
		await profiles.update(a.id, { emailVerifyCode: 'claim-a' });
		await profiles.update(b.id, { emailVerifyCode: 'claim-b' });
		const results = await Promise.allSettled([
			verify.exec({ code: 'claim-a' }, null, null),
			verify.exec({ code: 'claim-b' }, null, null),
		]);
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		const failure = results.find(result => result.status === 'rejected');
		expect(failure?.status === 'rejected' && failure.reason.code).toBe('EMAIL_ALREADY_USED');
		const verified = await profiles.findBy({ emailVerified: true });
		expect(verified).toHaveLength(1);
		expect(verified[0].email).toBe('claim@example.com');
	});

	test('pending signup claims email in the account creation transaction', async () => {
		const service = app.get(SignupService);
		const results = await Promise.allSettled([
			service.signup({ username: 'claimsignupfirst', verifiedEmail: 'Signup@Example.COM' }),
			service.signup({ username: 'claimsignupsecond', verifiedEmail: 'signup@example.com' }),
		]);
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(await profiles.countBy({ email: 'signup@example.com', emailVerified: true })).toBe(1);
		expect(await users.count()).toBe(1);
	});

	test('concurrent email changes keep the saved address paired with its own verification code', async () => {
		const user = await createUser();
		await profiles.update(user.id, { password: await bcrypt.hash('change-email', 8) });
		const send = vi.spyOn(email, 'sendEmail').mockResolvedValue();
		const update = app.get(UpdateEmailEndpoint);
		await Promise.all([
			update.exec({ email: ' First@Example.COM ', password: 'change-email' }, user as MiLocalUser, null),
			update.exec({ email: ' Second@Example.COM ', password: 'change-email' }, user as MiLocalUser, null),
		]);
		const profile = await profiles.findOneByOrFail({ userId: user.id });
		expect(profile.emailVerified).toBe(false);
		expect(send).toHaveBeenCalledTimes(2);
		const matchingMessage = send.mock.calls.find(call => call[2].includes(`/verify-email/${profile.emailVerifyCode}`));
		expect(matchingMessage?.[0]).toBe(profile.email);
		const staleMessage = send.mock.calls.find(call => call[0] !== profile.email)!;
		const staleCode = staleMessage[2].match(/\/verify-email\/([a-zA-Z0-9]+)/)![1];
		await expect(verify.exec({ code: staleCode }, null, null)).rejects.toMatchObject({ code: 'NO_SUCH_CODE' });
	});
});
