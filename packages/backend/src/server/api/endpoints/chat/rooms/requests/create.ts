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
		ref: 'ChatRoomJoinRequest',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '56af7cb5-5c36-4d35-b98a-ce4f53f18f8a',
		},
		isYourself: {
			message: 'You cannot request to join your own room.',
			code: 'IS_YOURSELF',
			id: '41333c6f-0e26-46d7-8f2b-c47f714b4d87',
		},
		alreadyMember: {
			message: 'You are already a member of this room.',
			code: 'ALREADY_MEMBER',
			id: 'b304846f-e151-434c-88a5-f3961473f679',
		},
		alreadyInvited: {
			message: 'You have already been invited to this room.',
			code: 'ALREADY_INVITED',
			id: 'e4c83205-738b-4ee5-89fc-7c0b7081e609',
		},
		alreadyRequested: {
			message: 'You have already requested to join this room.',
			code: 'ALREADY_REQUESTED',
			id: '7d49d89f-e6d3-4601-a337-5afee4c5501c',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
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
				const request = await this.chatService.createRoomJoinRequest(me.id, room.id);
				return await this.chatEntityService.packRoomJoinRequest(request, me);
			} catch (err) {
				if (err instanceof Error) {
					switch (err.message) {
						case 'yourself':
							throw new ApiError(meta.errors.isYourself);
						case 'already member':
							throw new ApiError(meta.errors.alreadyMember);
						case 'already invited':
							throw new ApiError(meta.errors.alreadyInvited);
						case 'already requested':
							throw new ApiError(meta.errors.alreadyRequested);
					}
				}

				throw err;
			}
		});
	}
}
