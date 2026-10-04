/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { NotificationService } from '@/core/NotificationService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['notifications'], requireCredential: true, kind: 'write:notifications',
	limit: { duration: 60000, max: 120 },
	res: {
		type: 'object', optional: false, nullable: false,
		properties: { unreadCount: { type: 'number', optional: false, nullable: false } },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		notificationIds: { type: 'array', minItems: 1, maxItems: 100, uniqueItems: true, items: { type: 'string', format: 'misskey:id' } },
	},
	required: ['notificationIds'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private notificationService: NotificationService) {
		super(meta, paramDef, (ps, me) => this.notificationService.readNotifications(me.id, ps.notificationIds));
	}
}
