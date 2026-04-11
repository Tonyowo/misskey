/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { filterChatHistoryItems, type ChatHistoryItem } from '@/pages/chat/history-items.js';

const baseItems = [{
	id: 'direct-unread',
	isMe: false,
	other: {} as any,
	message: {
		id: 'direct-unread',
		toRoomId: null,
		isRead: false,
	} as any,
}, {
	id: 'direct-read',
	isMe: false,
	other: {} as any,
	message: {
		id: 'direct-read',
		toRoomId: null,
		isRead: true,
	} as any,
}, {
	id: 'group-unread',
	isMe: false,
	other: null,
	message: {
		id: 'group-unread',
		toRoomId: 'room-a',
		isRead: false,
	} as any,
}, {
	id: 'mine',
	isMe: true,
	other: {} as any,
	message: {
		id: 'mine',
		toRoomId: null,
		isRead: false,
	} as any,
}] satisfies ChatHistoryItem[];

describe('chat history filters', () => {
	test('returns all items for the all filter', () => {
		expect(filterChatHistoryItems(baseItems, 'all').map(item => item.id)).toEqual([
			'direct-unread',
			'direct-read',
			'group-unread',
			'mine',
		]);
	});

	test('returns only direct conversations for the direct filter', () => {
		expect(filterChatHistoryItems(baseItems, 'direct').map(item => item.id)).toEqual([
			'direct-unread',
			'direct-read',
			'mine',
		]);
	});

	test('returns only group conversations for the group filter', () => {
		expect(filterChatHistoryItems(baseItems, 'group').map(item => item.id)).toEqual([
			'group-unread',
		]);
	});

	test('returns only unread conversations from other users for the unread filter', () => {
		expect(filterChatHistoryItems(baseItems, 'unread').map(item => item.id)).toEqual([
			'direct-unread',
			'group-unread',
		]);
	});
});
