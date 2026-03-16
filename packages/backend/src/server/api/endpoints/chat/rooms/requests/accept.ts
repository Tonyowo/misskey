/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { EntityNotFoundError } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoomMembership',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '8bfc838f-21a7-4b50-b95a-7828ced76e34',
		},
		noSuchRequest: {
			message: 'No such room join request.',
			code: 'NO_SUCH_REQUEST',
			id: '3f26c5aa-5bb7-4320-b0a7-c787f4cebca1',
		},
		forbidden: {
			message: 'You are not allowed to approve requests for this room.',
			code: 'FORBIDDEN',
			id: 'e0cc233c-50c5-49fb-b16f-09762b72d7b6',
		},
		roomIsFull: {
			message: 'This room is full.',
			code: 'ROOM_IS_FULL',
			id: 'a8844dab-b854-4c8c-ba88-f8eb4a93a71b',
		},
		targetUserBanned: {
			message: 'Target user is banned from this room.',
			code: 'TARGET_USER_BANNED',
			id: 'f5648269-cf9d-4e13-9075-b9fba45f81e7',
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

			const room = await this.chatService.findRoomById(ps.roomId);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			try {
				const membership = await this.chatService.approveRoomJoinRequest(me.id, room.id, ps.userId);
				return await this.chatEntityService.packRoomMembership(membership, me, {
					populateUser: true,
				});
			} catch (err) {
				if (err instanceof EntityNotFoundError) {
					throw new ApiError(meta.errors.noSuchRequest);
				}

				if (err instanceof Error) {
					switch (err.message) {
						case 'room is full':
							throw new ApiError(meta.errors.roomIsFull);
						case 'forbidden':
							throw new ApiError(meta.errors.forbidden);
						case 'banned':
							throw new ApiError(meta.errors.targetUserBanned);
					}
				}

				throw err;
			}
		});
	}
}
