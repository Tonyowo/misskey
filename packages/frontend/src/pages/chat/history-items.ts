/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

export type ChatConversationFilter = 'all' | 'unread' | 'direct' | 'group';

export type ChatHistoryItem = {
	id: string;
	message: Misskey.entities.ChatMessage;
	other: Misskey.entities.ChatMessage['fromUser'] | Misskey.entities.ChatMessage['toUser'] | null;
	isMe: boolean;
};

export type ChatHistoryStats = {
	all: number;
	unread: number;
	direct: number;
	group: number;
};

export function filterChatHistoryItems(items: ChatHistoryItem[], filter: ChatConversationFilter): ChatHistoryItem[] {
	switch (filter) {
		case 'unread':
			return items.filter(item => !item.isMe && item.message.isRead !== true);
		case 'direct':
			return items.filter(item => item.message.toRoomId == null);
		case 'group':
			return items.filter(item => item.message.toRoomId != null);
		case 'all':
		default:
			return items;
	}
}

export function getChatHistoryStats(items: ChatHistoryItem[]): ChatHistoryStats {
	return {
		all: items.length,
		unread: items.filter(item => !item.isMe && item.message.isRead !== true).length,
		direct: items.filter(item => item.message.toRoomId == null).length,
		group: items.filter(item => item.message.toRoomId != null).length,
	};
}
