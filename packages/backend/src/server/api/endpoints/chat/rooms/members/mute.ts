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
			id: '60d6e917-ce31-4cb8-9af0-ec4bc7f171f0',
		},
		forbidden: {
			message: 'You are not allowed to mute this member.',
			code: 'FORBIDDEN',
			id: '2b67ed40-f356-4353-9879-3d90c433bb2a',
		},
		cannotMuteOwner: {
			message: 'Owner cannot be muted.',
			code: 'CANNOT_MUTE_OWNER',
			id: '3c46ea53-e6b8-4275-a5bf-cfe055f4af35',
		},
		invalidExpiresAt: {
			message: 'expiresAt must be in the future.',
			code: 'INVALID_EXPIRES_AT',
			id: '57bde209-5fe1-4fe7-a122-2216135769d8',
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
				await this.chatService.muteRoomMember(me.id, ps.roomId, ps.userId, ps.expiresAt ? new Date(ps.expiresAt) : null, ps.reason ?? null);
			} catch (err) {
				if (err instanceof EntityNotFoundError) {
					throw new ApiError(meta.errors.noSuchMembership);
				}
				if (err instanceof Error) {
					switch (err.message) {
						case 'forbidden':
							throw new ApiError(meta.errors.forbidden);
						case 'cannot mute owner':
							throw new ApiError(meta.errors.cannotMuteOwner);
						case 'invalid expires at':
							throw new ApiError(meta.errors.invalidExpiresAt);
					}
				}
				throw err;
			}
		});
	}
}
