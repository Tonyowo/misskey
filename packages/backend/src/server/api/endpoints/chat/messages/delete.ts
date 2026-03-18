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
		noSuchMessage: {
			message: 'No such message.',
			code: 'NO_SUCH_MESSAGE',
			id: '36b67f0e-66a6-414b-83df-992a55294f17',
		},
		cannotDeleteSystemMessage: {
			message: 'System messages cannot be deleted.',
			code: 'CANNOT_DELETE_SYSTEM_MESSAGE',
			id: 'ee9eb8ff-a4ff-4e0b-94a3-16b5d19aa1e0',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		messageId: { type: 'string', format: 'misskey:id' },
	},
	required: ['messageId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			const message = await this.chatService.findMyMessageById(me.id, ps.messageId);
			if (message == null) {
				throw new ApiError(meta.errors.noSuchMessage);
			}

			try {
				await this.chatService.deleteMessage(message);
			} catch (err) {
				if (err instanceof Error && err.message === 'cannot delete system message') {
					throw new ApiError(meta.errors.cannotDeleteSystemMessage);
				}

				throw err;
			}
		});
	}
}
