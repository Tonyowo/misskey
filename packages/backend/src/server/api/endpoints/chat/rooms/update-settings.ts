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
			id: 'ff4f7ea4-0ca7-4d97-815d-f6959033cd4f',
		},
		invalidCombination: {
			message: 'Invalid room settings combination.',
			code: 'INVALID_COMBINATION',
			id: 'bdbf760e-769d-45d4-9369-f7c8fc5aa5f9',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', maxLength: 256 },
		description: { type: 'string', maxLength: 1024 },
		joinPolicy: { type: 'string', enum: ['invite_only', 'request_required', 'public'] },
		discoverability: { type: 'string', enum: ['private', 'unlisted', 'public'] },
		avatarFileId: { type: 'string', format: 'misskey:id', nullable: true },
		memberCanInvite: { type: 'boolean' },
		allowJoinRequest: { type: 'boolean' },
		maxMembers: { type: 'integer', minimum: 2, maximum: 500 },
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

			const room = await this.chatService.findMyRoomById(me.id, ps.roomId);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			try {
				const updated = await this.chatService.updateRoom(room, {
					name: ps.name,
					description: ps.description,
					joinPolicy: ps.joinPolicy,
					discoverability: ps.discoverability,
					avatarFileId: ps.avatarFileId,
					memberCanInvite: ps.memberCanInvite,
					allowJoinRequest: ps.allowJoinRequest,
					maxMembers: ps.maxMembers,
				});
				return this.chatEntityService.packRoom(updated, me);
			} catch (err) {
				if (err instanceof Error && err.message === 'invalid discoverability') {
					throw new ApiError(meta.errors.invalidCombination);
				}
				throw err;
			}
		});
	}
}
