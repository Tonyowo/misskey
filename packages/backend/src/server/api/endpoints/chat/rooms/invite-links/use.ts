/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
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
		invalidInviteLink: {
			message: 'Invalid invite link.',
			code: 'INVALID_INVITE_LINK',
			id: '84af6cb9-e7e1-4855-aefc-c6441c4e9836',
		},
		alreadyMember: {
			message: 'You are already a member of this room.',
			code: 'ALREADY_MEMBER',
			id: '264be7cb-2c15-4340-99ec-e23b33dbf5c5',
		},
		roomIsFull: {
			message: 'This room is full.',
			code: 'ROOM_IS_FULL',
			id: '85ae18cb-d955-4487-a181-b5d7d0915687',
		},
		banned: {
			message: 'You are banned from this room.',
			code: 'BANNED',
			id: '6ea4ef33-0e90-44f7-af68-21cece7f69e4',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		code: { type: 'string', minLength: 1, maxLength: 64 },
		roomId: { type: 'string', format: 'misskey:id' },
	},
	required: ['code'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				const room = await this.chatService.useRoomInviteLink(me.id, ps.code.trim(), ps.roomId);
				return await this.chatEntityService.packRoom(room, me);
			} catch (err) {
				if (err instanceof Error) {
					switch (err.message) {
						case 'invalid invite link':
							throw new ApiError(meta.errors.invalidInviteLink);
						case 'already member':
							throw new ApiError(meta.errors.alreadyMember);
						case 'room is full':
							throw new ApiError(meta.errors.roomIsFull);
						case 'banned':
							throw new ApiError(meta.errors.banned);
					}
					if (err.name === 'EntityNotFoundError') {
						throw new ApiError(meta.errors.invalidInviteLink);
					}
				}

				throw err;
			}
		});
	}
}
