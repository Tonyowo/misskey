/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'read:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			invitations: {
				type: 'integer',
				optional: false, nullable: false,
			},
			myRequests: {
				type: 'integer',
				optional: false, nullable: false,
			},
			joiningRooms: {
				type: 'integer',
				optional: false, nullable: false,
			},
			ownedRooms: {
				type: 'integer',
				optional: false, nullable: false,
			},
			pendingRequests: {
				type: 'integer',
				optional: false, nullable: false,
			},
			unreadConversations: {
				type: 'integer',
				optional: false, nullable: false,
			},
		},
	},

	errors: {},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (_ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');
			return await this.chatService.getChatSummary(me.id);
		});
	}
}
