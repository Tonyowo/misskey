/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import {
	globalEvents,
	type ChatCollectionScope,
	type ChatHomeInvalidationPayload,
	type ChatRoomCollectionsInvalidatedPayload,
	type ChatRoomUpdatedPayload,
} from '@/events.js';

type WithId = {
	id: string;
};

export function emitChatRoomUpdated(roomId: string, patch: Partial<Misskey.entities.ChatRoom>): void {
	globalEvents.emit('chatRoomUpdated', {
		roomId,
		patch,
	});
}

export function emitChatRoomCollectionsInvalidated(roomId: string | undefined, scopes: ChatCollectionScope[]): void {
	globalEvents.emit('chatRoomCollectionsInvalidated', {
		roomId,
		scopes,
	});
}

export function emitChatHomeInvalidated(payload: ChatHomeInvalidationPayload): void {
	globalEvents.emit('chatHomeInvalidated', payload);
}

export function shouldRefreshChatCollections(
	payload: ChatRoomCollectionsInvalidatedPayload,
	scopes: ChatCollectionScope[],
	roomId?: string,
): boolean {
	if (roomId != null && payload.roomId != null && payload.roomId !== roomId) {
		return false;
	}

	return scopes.some(scope => payload.scopes.includes(scope));
}

export function upsertById<T extends WithId>(items: T[], item: T, options?: {
	prepend?: boolean;
}): T[] {
	const filtered = items.filter(existing => existing.id !== item.id);

	return options?.prepend === false ? [...filtered, item] : [item, ...filtered];
}

export function removeById<T extends WithId>(items: T[], id: string): T[] {
	return items.filter(item => item.id !== id);
}

export function updateById<T extends WithId>(items: T[], id: string, updater: (item: T) => T): T[] {
	return items.map(item => item.id === id ? updater(item) : item);
}

export function applyChatRoomPatch<T extends {
	room?: Misskey.entities.ChatRoom | null;
}>(item: T, payload: ChatRoomUpdatedPayload): T {
	if (item.room == null || item.room.id !== payload.roomId) {
		return item;
	}

	return {
		...item,
		room: {
			...item.room,
			...payload.patch,
		},
	};
}
