/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import './init';
import { globalEvents } from '@/events.js';
import {
	applyChatRoomPatch,
	emitChatHomeInvalidated,
	emitChatRoomCollectionsInvalidated,
	emitChatRoomUpdated,
	removeById,
	shouldRefreshChatCollections,
	upsertById,
} from '@/pages/chat/state.js';

describe('chat state helpers', () => {
	afterEach(() => {
		globalEvents.removeAllListeners();
	});

	test('chat invalidation scopes only match subscribed collections', () => {
		expect(shouldRefreshChatCollections({
			roomId: 'room-a',
			scopes: ['members', 'counts'],
		}, ['joiningRooms'])).toBe(false);

		expect(shouldRefreshChatCollections({
			roomId: 'room-a',
			scopes: ['members', 'counts'],
		}, ['counts'])).toBe(true);

		expect(shouldRefreshChatCollections({
			roomId: 'room-a',
			scopes: ['joiningRooms'],
		}, ['joiningRooms'], 'room-b')).toBe(false);
	});

	test('upsertById keeps one copy of an entity and removeById deletes it', () => {
		const initial = [{
			id: 'a',
			value: 1,
		}, {
			id: 'b',
			value: 2,
		}];

		const updated = upsertById(initial, {
			id: 'b',
			value: 3,
		});

		expect(updated).toEqual([{
			id: 'b',
			value: 3,
		}, {
			id: 'a',
			value: 1,
		}]);

		expect(removeById(updated, 'b')).toEqual([{
			id: 'a',
			value: 1,
		}]);
	});

	test('applyChatRoomPatch updates nested room data', () => {
		const patched = applyChatRoomPatch({
			id: 'membership-1',
			room: {
				id: 'room-a',
				name: 'Before',
				memberCount: 2,
			} as any,
		}, {
			roomId: 'room-a',
			patch: {
				name: 'After',
				memberCount: 3,
			},
		});

		expect(patched.room).toMatchObject({
			id: 'room-a',
			name: 'After',
			memberCount: 3,
		});
	});

	test('chat emitters publish the expected payloads', () => {
		const onRoomUpdated = vi.fn();
		const onCollectionsInvalidated = vi.fn();
		const onHomeInvalidated = vi.fn();

		globalEvents.on('chatRoomUpdated', onRoomUpdated);
		globalEvents.on('chatRoomCollectionsInvalidated', onCollectionsInvalidated);
		globalEvents.on('chatHomeInvalidated', onHomeInvalidated);

		emitChatRoomUpdated('room-a', {
			memberCount: 4,
		});
		emitChatRoomCollectionsInvalidated('room-a', ['members', 'counts']);
		emitChatHomeInvalidated({
			reason: 'room-member-kicked',
			roomId: 'room-a',
			scopes: ['joiningRooms', 'counts'],
		});

		expect(onRoomUpdated).toHaveBeenCalledWith({
			roomId: 'room-a',
			patch: {
				memberCount: 4,
			},
		});
		expect(onCollectionsInvalidated).toHaveBeenCalledWith({
			roomId: 'room-a',
			scopes: ['members', 'counts'],
		});
		expect(onHomeInvalidated).toHaveBeenCalledWith({
			reason: 'room-member-kicked',
			roomId: 'room-a',
			scopes: ['joiningRooms', 'counts'],
		});
	});
});
