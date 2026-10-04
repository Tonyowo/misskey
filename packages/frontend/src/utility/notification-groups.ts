/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { entities } from 'misskey-js';

export type NotificationGroup = { notification: entities.Notification; sourceIds: string[] };

export function groupNotifications(items: entities.Notification[], enabled: boolean): NotificationGroup[] {
	const groups: NotificationGroup[] = [];
	for (const item of items) {
		const previous = groups.at(-1);
		const groupable = enabled && (item.type === 'reaction' || item.type === 'renote');
		if (groupable && previous && 'note' in previous.notification && previous.notification.note.id === item.note.id
			&& previous.notification.createdAt.slice(0, 10) === item.createdAt.slice(0, 10)) {
			const base = previous.notification;
			if (item.type === 'reaction' && (base.type === 'reaction' || base.type === 'reaction:grouped')) {
				previous.notification = {
					id: base.id, createdAt: base.createdAt, isRead: base.isRead && item.isRead,
					type: 'reaction:grouped', note: item.note,
					reactions: [...(base.type === 'reaction' ? [{ user: base.user, reaction: base.reaction }] : base.reactions), { user: item.user, reaction: item.reaction }],
				};
				previous.sourceIds.push(item.id);
				continue;
			}
			if (item.type === 'renote' && (base.type === 'renote' || base.type === 'renote:grouped')) {
				previous.notification = {
					id: base.id, createdAt: base.createdAt, isRead: base.isRead && item.isRead,
					type: 'renote:grouped', note: item.note,
					users: [...(base.type === 'renote' ? [base.user] : base.users), item.user],
				};
				previous.sourceIds.push(item.id);
				continue;
			}
		}
		groups.push({ notification: item, sourceIds: [item.id] });
	}
	return groups;
}
