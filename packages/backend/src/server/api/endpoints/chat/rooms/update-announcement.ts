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
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'd2df3024-8d89-4b6c-bb80-bbf28952cd8c',
		},
		forbidden: {
			message: 'You are not allowed to update this room announcement.',
			code: 'FORBIDDEN',
			id: 'f1b5067e-8389-4e2a-84ae-42f0466944de',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		announcement: { type: 'string', maxLength: 4096 },
	},
	required: ['roomId', 'announcement'],
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
				const updated = await this.chatService.updateRoomAnnouncement(me.id, room.id, ps.announcement);
				return await this.chatEntityService.packRoom(updated, me);
			} catch (err) {
				if (err instanceof Error && err.message === 'forbidden') {
					throw new ApiError(meta.errors.forbidden);
				}

				throw err;
			}
		});
	}
}
