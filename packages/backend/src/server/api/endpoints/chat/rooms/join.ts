/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '84416476-5ce8-4a2c-b568-9569f1b10733',
		},
		notInvited: {
			message: 'You are not invited to this room.',
			code: 'NOT_INVITED',
			id: '93cc54d4-06a2-4509-9038-8f80539f2c56',
		},
		alreadyMember: {
			message: 'You are already a member of this room.',
			code: 'ALREADY_MEMBER',
			id: 'f1ec2399-1f4c-4289-8c7b-3d3a18317d8f',
		},
		roomIsFull: {
			message: 'This room is full.',
			code: 'ROOM_IS_FULL',
			id: '4bd968a4-fe7c-4828-b0f9-b35f4e8cab65',
		},
		banned: {
			message: 'You are banned from this room.',
			code: 'BANNED',
			id: 'f9dc7e16-2506-43f8-a02d-e94f5f945f53',
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
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				await this.chatService.joinToRoom(me.id, ps.roomId);
			} catch (err) {
				if (err instanceof Error) {
					switch (err.message) {
						case 'not invited':
							throw new ApiError(meta.errors.notInvited);
						case 'already member':
							throw new ApiError(meta.errors.alreadyMember);
						case 'room is full':
							throw new ApiError(meta.errors.roomIsFull);
						case 'banned':
							throw new ApiError(meta.errors.banned);
					}
				}
				throw err;
			}
		});
	}
}
