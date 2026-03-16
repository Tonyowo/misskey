/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { EntityNotFoundError } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoom',
	},

	errors: {
		noSuchMembership: {
			message: 'Target user must be a room member.',
			code: 'NO_SUCH_MEMBERSHIP',
			id: '5a0b2655-a194-46ee-bb84-56f7cc8448ea',
		},
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'a459f7b5-c6cf-4d65-a1e8-9f6b3ca9f0ca',
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
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');
			const currentRoom = await this.chatService.findMyRoomById(me.id, ps.roomId);
			if (currentRoom == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			try {
				const room = await this.chatService.transferRoomOwner(me.id, ps.roomId, ps.userId);
				return await this.chatEntityService.packRoom(room, me);
			} catch (err) {
				if (err instanceof EntityNotFoundError) {
					throw new ApiError(meta.errors.noSuchMembership);
				}
				throw err;
			}
		});
	}
}
