/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { EntityNotFoundError } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		noSuchMembership: {
			message: 'No such room member.',
			code: 'NO_SUCH_MEMBERSHIP',
			id: '680f0eca-6197-49b8-a0ef-4dd3097d24d4',
		},
		forbidden: {
			message: 'You are not allowed to unmute this member.',
			code: 'FORBIDDEN',
			id: '34bbef78-2a5c-4eb7-a631-cb0b0df5b8f8',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
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
				await this.chatService.unmuteRoomMember(me.id, ps.roomId, ps.userId);
			} catch (err) {
				if (err instanceof EntityNotFoundError) {
					throw new ApiError(meta.errors.noSuchMembership);
				}
				if (err instanceof Error && err.message === 'forbidden') {
					throw new ApiError(meta.errors.forbidden);
				}
				throw err;
			}
		});
	}
}
