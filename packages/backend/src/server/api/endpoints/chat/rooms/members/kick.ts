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
			id: 'ee7f9ef6-18d2-499f-bf77-86524af93e85',
		},
		forbidden: {
			message: 'You are not allowed to kick this member.',
			code: 'FORBIDDEN',
			id: '5cd84fc4-6a1d-4178-adcb-a9362c62b070',
		},
		cannotKickOwner: {
			message: 'Owner cannot be kicked.',
			code: 'CANNOT_KICK_OWNER',
			id: '80eecb1f-4ec1-4d2f-a7e9-a669f95bf7aa',
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
				await this.chatService.kickRoomMember(me.id, ps.roomId, ps.userId);
			} catch (err) {
				if (err instanceof EntityNotFoundError) {
					throw new ApiError(meta.errors.noSuchMembership);
				}
				if (err instanceof Error) {
					switch (err.message) {
						case 'forbidden':
							throw new ApiError(meta.errors.forbidden);
						case 'cannot kick owner':
							throw new ApiError(meta.errors.cannotKickOwner);
					}
				}
				throw err;
			}
		});
	}
}
