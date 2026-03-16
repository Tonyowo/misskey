/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1day'),
		max: 50,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoomInvitation',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '916f9507-49ba-4e90-b57f-1fd4deaa47a5',
		},
		forbidden: {
			message: 'You are not allowed to invite users to this room.',
			code: 'FORBIDDEN',
			id: '6fc03a47-3db1-4ea5-8338-c9bd60f85042',
		},
		isYourself: {
			message: 'Target user is yourself.',
			code: 'IS_YOURSELF',
			id: 'f24758f4-d12e-47f9-86d2-95a4d1c78029',
		},
		alreadyMember: {
			message: 'Target user is already a member.',
			code: 'ALREADY_MEMBER',
			id: '09d36d36-2eff-49cf-ad9c-714f2f22f061',
		},
		alreadyInvited: {
			message: 'Target user has already been invited.',
			code: 'ALREADY_INVITED',
			id: 'cf4f7a0e-18fe-46b5-b768-9950defa1681',
		},
		roomIsFull: {
			message: 'This room is full.',
			code: 'ROOM_IS_FULL',
			id: '2fe10100-3628-4960-a8ca-2d7f1996758f',
		},
		targetUserBanned: {
			message: 'Target user is banned from this room.',
			code: 'TARGET_USER_BANNED',
			id: '0f6e30fb-16cc-4b11-bf31-1cf9df9fde73',
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
				const invitation = await this.chatService.createRoomInvitation(me.id, room.id, ps.userId);
				return await this.chatEntityService.packRoomInvitation(invitation, me);
			} catch (err) {
				if (err instanceof Error) {
					switch (err.message) {
						case 'yourself':
							throw new ApiError(meta.errors.isYourself);
						case 'already member':
							throw new ApiError(meta.errors.alreadyMember);
						case 'already invited':
							throw new ApiError(meta.errors.alreadyInvited);
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
