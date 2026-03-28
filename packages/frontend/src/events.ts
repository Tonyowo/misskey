/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'eventemitter3';
import * as Misskey from 'misskey-js';
import { onBeforeUnmount } from 'vue';

export const chatCollectionScopes = [
	'members',
	'requests',
	'invitations',
	'bans',
	'counts',
	'joiningRooms',
	'ownedRooms',
	'myRequests',
	'myInvitations',
] as const;

export type ChatCollectionScope = typeof chatCollectionScopes[number];

export type ChatRoomUpdatedPayload = {
	roomId: string;
	patch: Partial<Misskey.entities.ChatRoom>;
};

export type ChatRoomCollectionsInvalidatedPayload = {
	roomId?: string;
	scopes: ChatCollectionScope[];
};

export type ChatHomeInvalidationPayload = {
	reason: string;
	roomId?: string;
	scopes?: ChatCollectionScope[];
};

type Events = {
	themeChanging: () => void;
	themeChanged: () => void;
	clientNotification: (notification: Misskey.entities.Notification) => void;
	notePosted: (note: Misskey.entities.Note) => void;
	noteUpdated: (note: Misskey.entities.Note) => void;
	noteDeleted: (noteId: Misskey.entities.Note['id']) => void;
	driveFileCreated: (file: Misskey.entities.DriveFile) => void;
	driveFilesUpdated: (files: Misskey.entities.DriveFile[]) => void;
	driveFilesDeleted: (files: Misskey.entities.DriveFile[]) => void;
	driveFoldersUpdated: (folders: Misskey.entities.DriveFolder[]) => void;
	driveFoldersDeleted: (folders: Misskey.entities.DriveFolder[]) => void;
	chatRoomUpdated: (payload: ChatRoomUpdatedPayload) => void;
	chatRoomCollectionsInvalidated: (payload: ChatRoomCollectionsInvalidatedPayload) => void;
	chatHomeInvalidated: (payload: ChatHomeInvalidationPayload) => void;
};

export const globalEvents = new EventEmitter<Events>();

export function useGlobalEvent<T extends keyof Events>(
	event: T,
	callback: EventEmitter.EventListener<Events, T>,
): void {
	globalEvents.on(event, callback);
	onBeforeUnmount(() => {
		globalEvents.off(event, callback);
	});
}
