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
			id: '9f1cb3af-c7c2-4447-b58e-c6430b2f03ce',
		},
		forbidden: {
			message: 'You are not allowed to pin messages in this room.',
			code: 'FORBIDDEN',
			id: '99552a3c-efef-452e-be20-b3f8d07de880',
		},
		invalidMessage: {
			message: 'Invalid message.',
			code: 'INVALID_MESSAGE',
			id: '842f1f29-6b66-44ee-922e-c0d92ff0baf2',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		messageId: { type: 'string', format: 'misskey:id', nullable: true },
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
				const updated = await this.chatService.pinRoomMessage(me.id, room.id, ps.messageId ?? null);
				return await this.chatEntityService.packRoom(updated, me);
			} catch (err) {
				if (err instanceof Error) {
					switch (err.message) {
						case 'forbidden':
							throw new ApiError(meta.errors.forbidden);
						case 'invalid message':
							throw new ApiError(meta.errors.invalidMessage);
					}
					if (err.name === 'EntityNotFoundError') {
						throw new ApiError(meta.errors.invalidMessage);
					}
				}

				throw err;
			}
		});
	}
}
