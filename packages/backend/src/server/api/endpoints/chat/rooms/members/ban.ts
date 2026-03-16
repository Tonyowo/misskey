/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		forbidden: {
			message: 'You are not allowed to ban this user.',
			code: 'FORBIDDEN',
			id: 'f981c06e-4690-4af5-afef-d0f6280e17a9',
		},
		cannotBanOwner: {
			message: 'Owner cannot be banned.',
			code: 'CANNOT_BAN_OWNER',
			id: '52de8901-c4cb-4ca0-9619-a9ca14f17ec1',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
		reason: { type: 'string', maxLength: 1024, nullable: true },
		expiresAt: { type: 'integer', nullable: true },
	},
	required: ['roomId', 'userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');
			try {
				await this.chatService.banRoomMember(me.id, ps.roomId, ps.userId, ps.reason ?? null, ps.expiresAt ? new Date(ps.expiresAt) : null);
			} catch (err) {
				if (err instanceof Error) {
					switch (err.message) {
						case 'forbidden':
							throw new ApiError(meta.errors.forbidden);
						case 'cannot ban owner':
							throw new ApiError(meta.errors.cannotBanOwner);
					}
				}
				throw err;
			}
		});
	}
}
