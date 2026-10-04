/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService, ChatMessageAccessError } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		noSuchMessage: {
			message: 'No such message.',
			code: 'NO_SUCH_MESSAGE',
			id: '9b5839b9-0ba0-4351-8c35-37082093d200',
		},
		cannotReactSystemMessage: {
			message: 'System messages cannot be reacted to.',
			code: 'CANNOT_REACT_SYSTEM_MESSAGE',
			id: '919b71ad-c1c9-4d66-8668-779c4144ebe4',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		messageId: { type: 'string', format: 'misskey:id' },
		reaction: { type: 'string' },
	},
	required: ['messageId', 'reaction'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				await this.chatService.react(ps.messageId, me.id, ps.reaction);
			} catch (err) {
				if (err instanceof Error && err.message === 'cannot react to system message') {
					throw new ApiError(meta.errors.cannotReactSystemMessage);
				}

				if (err instanceof ChatMessageAccessError) throw new ApiError(meta.errors.noSuchMessage);
				throw err;
			}
		});
	}
}
