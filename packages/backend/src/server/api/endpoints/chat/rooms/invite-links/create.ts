/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1hour'),
		max: 30,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoomInviteLink',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'c8170efa-84fd-417d-a50b-e1e915f1098f',
		},
		forbidden: {
			message: 'You are not allowed to create invite links for this room.',
			code: 'FORBIDDEN',
			id: '2a66b2ff-43f4-490c-8c7a-95eece4fcbf8',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		expiresAt: { type: 'integer', nullable: true },
		maxUses: { type: 'integer', minimum: 1, maximum: 10000, nullable: true },
	},
	required: ['roomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			const room = await this.chatService.findRoomById(ps.roomId);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			try {
				const inviteLink = await this.chatService.createRoomInviteLink(me.id, room.id, {
					expiresAt: ps.expiresAt != null ? new Date(ps.expiresAt) : null,
					maxUses: ps.maxUses ?? null,
				});
				return await this.chatEntityService.packRoomInviteLink(inviteLink, me);
			} catch (err) {
				if (err instanceof Error && err.message === 'forbidden') {
					throw new ApiError(meta.errors.forbidden);
				}

				throw err;
			}
		});
	}
}
