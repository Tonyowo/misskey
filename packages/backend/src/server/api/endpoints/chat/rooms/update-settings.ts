/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { chatRoomAdminPermissions } from '@/models/ChatRoom.js';

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
		forbidden: {
			message: 'You are not allowed to update this room settings.',
			code: 'FORBIDDEN',
			id: '7048c815-a44e-4d78-b6c4-00dc20d7f875',
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
		adminPermissions: {
			type: 'array',
			uniqueItems: true,
			items: {
				type: 'string',
				enum: chatRoomAdminPermissions,
			},
		},
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

			const room = await this.chatService.findRoomById(ps.roomId);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			const isOwner = room.ownerId === me.id;
			const isAdmin = isOwner || await this.chatService.isRoomAdmin(room, me.id);

			if (!isAdmin) {
				throw new ApiError(meta.errors.forbidden);
			}

			const isAvatarOnlyUpdate = !isOwner
				&& ps.avatarFileId !== undefined
				&& ps.name === undefined
				&& ps.description === undefined
				&& ps.joinPolicy === undefined
				&& ps.discoverability === undefined
				&& ps.memberCanInvite === undefined
				&& ps.adminPermissions === undefined
				&& ps.allowJoinRequest === undefined
				&& ps.maxMembers === undefined;

			if (!isOwner && !isAvatarOnlyUpdate) {
				throw new ApiError(meta.errors.forbidden);
			}

			try {
				const updated = await this.chatService.updateRoom(room, {
					name: isOwner ? ps.name : undefined,
					description: isOwner ? ps.description : undefined,
					joinPolicy: isOwner ? ps.joinPolicy : undefined,
					discoverability: isOwner ? ps.discoverability : undefined,
					avatarFileId: ps.avatarFileId,
					memberCanInvite: isOwner ? ps.memberCanInvite : undefined,
					adminPermissions: isOwner ? ps.adminPermissions : undefined,
					allowJoinRequest: isOwner ? ps.allowJoinRequest : undefined,
					maxMembers: isOwner ? ps.maxMembers : undefined,
				}, me.id);
				return this.chatEntityService.packRoom(updated, me);
			} catch (err) {
				if (err instanceof Error && err.message === 'forbidden') {
					throw new ApiError(meta.errors.forbidden);
				}
				if (err instanceof Error && err.message === 'invalid discoverability') {
					throw new ApiError(meta.errors.invalidCombination);
				}
				throw err;
			}
		});
	}
}
