/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		forbidden: {
			message: 'You are not allowed to revoke this invite link.',
			code: 'FORBIDDEN',
			id: '46aff00d-4a01-4d8c-824f-e0b7d4df1a67',
		},
		noSuchInviteLink: {
			message: 'No such invite link.',
			code: 'NO_SUCH_INVITE_LINK',
			id: 'c68b87da-1a8a-4a8d-bc09-c1a9f1d1aa9a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		inviteLinkId: { type: 'string', format: 'misskey:id' },
	},
	required: ['inviteLinkId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				await this.chatService.revokeRoomInviteLink(me.id, ps.inviteLinkId);
			} catch (err) {
				if (err instanceof Error) {
					switch (err.message) {
						case 'forbidden':
							throw new ApiError(meta.errors.forbidden);
					}
					if (err.name === 'EntityNotFoundError') {
						throw new ApiError(meta.errors.noSuchInviteLink);
					}
				}

				throw err;
			}
		});
	}
}
