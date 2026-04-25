/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { api, failedApiCall, signup, successfulApiCall } from '../utils.js';
import type * as Misskey from 'misskey-js';

type ChatSummary = {
	invitations: number;
	myRequests: number;
	joiningRooms: number;
	ownedRooms: number;
	pendingRequests: number;
	unreadConversations: number;
	unreadMentionConversations: number;
};

describe('chat', () => {
	let alice: Misskey.entities.SignupResponse;
	let bob: Misskey.entities.SignupResponse;
	let charlie: Misskey.entities.SignupResponse;

	beforeAll(async () => {
		alice = await signup();
		bob = await signup();
		charlie = await signup();
	}, 1000 * 60 * 2);

	test('summary, history, and read-all stay in sync for direct and group chats', async () => {
		await successfulApiCall({
			endpoint: 'chat/messages/create-to-user',
			parameters: {
				toUserId: alice.id,
				text: 'hello alice',
			},
			user: bob,
		});

		const room = await successfulApiCall({
			endpoint: 'chat/rooms/create',
			parameters: {
				name: 'chat-test-room',
			},
			user: alice,
		});

		await successfulApiCall({
			endpoint: 'chat/rooms/invitations/create',
			parameters: {
				roomId: room.id,
				userId: bob.id,
			},
			user: alice,
		});

		await successfulApiCall({
			endpoint: 'chat/rooms/join',
			parameters: {
				roomId: room.id,
			},
			user: bob,
		}, {
			status: 204,
		});

		await successfulApiCall({
			endpoint: 'chat/messages/create-to-room',
			parameters: {
				toRoomId: room.id,
				text: 'hello room',
			},
			user: bob,
		});

		const summaryBefore = await api('chat/summary' as never, {} as never, alice);
		assert.strictEqual(summaryBefore.status, 200);
		const summaryBeforeBody = summaryBefore.body as ChatSummary;
		assert.strictEqual(summaryBeforeBody.ownedRooms, 1);
		assert.strictEqual(summaryBeforeBody.joiningRooms, 0);
		assert.strictEqual(summaryBeforeBody.unreadConversations, 2);

		const directHistory = await successfulApiCall({
			endpoint: 'chat/history',
			parameters: {
				room: false,
				limit: 10,
			},
			user: alice,
		});
		assert.strictEqual(directHistory.length, 1);
		assert.strictEqual(directHistory[0].text, 'hello alice');
		assert.strictEqual(directHistory[0].isRead, false);

		const roomHistory = await successfulApiCall({
			endpoint: 'chat/history',
			parameters: {
				room: true,
				limit: 10,
			},
			user: alice,
		});
		assert.strictEqual(roomHistory.length, 1);
		assert.strictEqual(roomHistory[0].text, 'hello room');
		assert.strictEqual(roomHistory[0].isRead, false);

		await successfulApiCall({
			endpoint: 'chat/read-all',
			parameters: {},
			user: alice,
		}, {
			status: 204,
		});

		const summaryAfter = await api('chat/summary' as never, {} as never, alice);
		assert.strictEqual(summaryAfter.status, 200);
		const summaryAfterBody = summaryAfter.body as ChatSummary;
		assert.strictEqual(summaryAfterBody.unreadConversations, 0);

		const directHistoryAfter = await successfulApiCall({
			endpoint: 'chat/history',
			parameters: {
				room: false,
				limit: 10,
			},
			user: alice,
		});
		assert.strictEqual(directHistoryAfter[0].isRead, true);

		const roomHistoryAfter = await successfulApiCall({
			endpoint: 'chat/history',
			parameters: {
				room: true,
				limit: 10,
			},
			user: alice,
		});
		assert.strictEqual(roomHistoryAfter[0].isRead, true);
	});

	test('group chat mentions are persisted and mention-all is admin-only', async () => {
		const room = await successfulApiCall({
			endpoint: 'chat/rooms/create',
			parameters: {
				name: 'chat-mention-room',
			},
			user: alice,
		});

		await successfulApiCall({
			endpoint: 'chat/rooms/invitations/create',
			parameters: {
				roomId: room.id,
				userId: bob.id,
			},
			user: alice,
		});

		await successfulApiCall({
			endpoint: 'chat/rooms/join',
			parameters: {
				roomId: room.id,
			},
			user: bob,
		}, {
			status: 204,
		});

		const memberMention = await successfulApiCall({
			endpoint: 'chat/messages/create-to-room',
			parameters: {
				toRoomId: room.id,
				text: `hello @${bob.username}`,
			},
			user: alice,
		});
		assert.deepStrictEqual((memberMention as any).mentions, [bob.id]);
		assert.strictEqual((memberMention as any).mentionAll, false);

		const nonMemberMention = await successfulApiCall({
			endpoint: 'chat/messages/create-to-room',
			parameters: {
				toRoomId: room.id,
				text: `hello @${charlie.username}`,
			},
			user: alice,
		});
		assert.deepStrictEqual((nonMemberMention as any).mentions, []);

		await failedApiCall({
			endpoint: 'chat/messages/create-to-room',
			parameters: {
				toRoomId: room.id,
				text: '@all please read',
			},
			user: bob,
		}, {
			status: 400,
			code: 'MENTION_ALL_FORBIDDEN',
			id: '5380b754-af85-478d-9fa1-afea8ab55a09',
		});

		const allMention = await successfulApiCall({
			endpoint: 'chat/messages/create-to-room',
			parameters: {
				toRoomId: room.id,
				text: '@全体成员 please read',
			},
			user: alice,
		});
		assert.strictEqual((allMention as any).mentionAll, true);
	});

	test('group mention unread survives room mute and clears when read', async () => {
		const room = await successfulApiCall({
			endpoint: 'chat/rooms/create',
			parameters: {
				name: 'chat-muted-mention-room',
			},
			user: alice,
		});

		await successfulApiCall({
			endpoint: 'chat/rooms/invitations/create',
			parameters: {
				roomId: room.id,
				userId: bob.id,
			},
			user: alice,
		});

		await successfulApiCall({
			endpoint: 'chat/rooms/join',
			parameters: {
				roomId: room.id,
			},
			user: bob,
		}, {
			status: 204,
		});

		await successfulApiCall({
			endpoint: 'chat/rooms/mute',
			parameters: {
				roomId: room.id,
				mute: true,
			},
			user: bob,
		}, {
			status: 204,
		});

		const mention = await successfulApiCall({
			endpoint: 'chat/messages/create-to-room',
			parameters: {
				toRoomId: room.id,
				text: `muted room ping @${bob.username}`,
			},
			user: alice,
		});

		const summaryBefore = await api('chat/summary' as never, {} as never, bob);
		assert.strictEqual(summaryBefore.status, 200);
		const summaryBeforeBody = summaryBefore.body as ChatSummary;
		assert.strictEqual(summaryBeforeBody.unreadConversations, 1);
		assert.strictEqual(summaryBeforeBody.unreadMentionConversations, 1);

		const roomHistory = await successfulApiCall({
			endpoint: 'chat/history',
			parameters: {
				room: true,
				limit: 10,
			},
			user: bob,
		});
		assert.strictEqual((roomHistory[0] as any).hasUnreadMention, true);
		assert.strictEqual((roomHistory[0] as any).mentionMessageId, mention.id);

		await successfulApiCall({
			endpoint: 'chat/messages/room-timeline',
			parameters: {
				roomId: room.id,
				limit: 10,
			},
			user: bob,
		});

		const summaryAfter = await api('chat/summary' as never, {} as never, bob);
		assert.strictEqual(summaryAfter.status, 200);
		const summaryAfterBody = summaryAfter.body as ChatSummary;
		assert.strictEqual(summaryAfterBody.unreadConversations, 0);
		assert.strictEqual(summaryAfterBody.unreadMentionConversations, 0);
	});

	test('group discovery, requests, moderation, and removal work together', async () => {
		const roomName = `chat-flow-room-${Date.now()}`;
		const room = await successfulApiCall({
			endpoint: 'chat/rooms/create',
			parameters: {
				name: roomName,
			},
			user: alice,
		});

		const updatedRoom = await successfulApiCall({
			endpoint: 'chat/rooms/update-settings',
			parameters: {
				roomId: room.id,
				joinPolicy: 'request_required',
				discoverability: 'public',
				allowJoinRequest: true,
			},
			user: alice,
		});
		assert.strictEqual(updatedRoom.joinPolicy, 'request_required');
		assert.strictEqual(updatedRoom.discoverability, 'public');

		const discoveredRooms = await successfulApiCall({
			endpoint: 'chat/rooms/discover' as never,
			parameters: {
				query: roomName,
				limit: 10,
			} as never,
			user: bob,
		});
		assert.ok((discoveredRooms as any[]).some(item => item.id === room.id));

		await successfulApiCall({
			endpoint: 'chat/rooms/requests/create',
			parameters: {
				roomId: room.id,
				message: 'please let me in',
			},
			user: bob,
		});

		const pendingRequests = await successfulApiCall({
			endpoint: 'chat/rooms/requests/list',
			parameters: {
				roomId: room.id,
				limit: 10,
			},
			user: alice,
		});
		assert.ok(pendingRequests.some(item => item.userId === bob.id));

		const membership = await successfulApiCall({
			endpoint: 'chat/rooms/requests/accept',
			parameters: {
				roomId: room.id,
				userId: bob.id,
			},
			user: alice,
		});
		assert.strictEqual(membership.userId, bob.id);

		const message = await successfulApiCall({
			endpoint: 'chat/messages/create-to-room',
			parameters: {
				toRoomId: room.id,
				text: 'hello after approval',
			},
			user: bob,
		});
		assert.strictEqual(message.text, 'hello after approval');

		await successfulApiCall({
			endpoint: 'chat/rooms/members/mute',
			parameters: {
				roomId: room.id,
				userId: bob.id,
				reason: 'test mute',
			},
			user: alice,
		}, {
			status: 204,
		});

		await failedApiCall({
			endpoint: 'chat/messages/create-to-room',
			parameters: {
				toRoomId: room.id,
				text: 'blocked while muted',
			},
			user: bob,
		}, {
			status: 400,
			code: 'MUTED_IN_ROOM',
			id: '67512792-fd66-4f82-a4ac-44ec9c75005e',
		});

		await successfulApiCall({
			endpoint: 'chat/rooms/members/unmute',
			parameters: {
				roomId: room.id,
				userId: bob.id,
			},
			user: alice,
		}, {
			status: 204,
		});

		await successfulApiCall({
			endpoint: 'chat/rooms/members/kick',
			parameters: {
				roomId: room.id,
				userId: bob.id,
			},
			user: alice,
		}, {
			status: 204,
		});

		const roomAfterKick = await successfulApiCall({
			endpoint: 'chat/rooms/show',
			parameters: {
				roomId: room.id,
			},
			user: bob,
		});
		assert.strictEqual(roomAfterKick.isJoined, false);
	});
});
