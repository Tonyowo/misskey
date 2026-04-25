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
};

describe('chat', () => {
	let alice: Misskey.entities.SignupResponse;
	let bob: Misskey.entities.SignupResponse;

	beforeAll(async () => {
		alice = await signup();
		bob = await signup();
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
			endpoint: 'chat/rooms/discover',
			parameters: {
				query: roomName,
				limit: 10,
			},
			user: bob,
		});
		assert.ok(discoveredRooms.some(item => item.id === room.id));

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
