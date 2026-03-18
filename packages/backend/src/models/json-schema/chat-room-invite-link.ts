/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatRoomInviteLinkSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		code: {
			type: 'string',
			optional: false, nullable: false,
		},
		roomId: {
			type: 'string',
			optional: false, nullable: false,
		},
		room: {
			type: 'object',
			optional: true, nullable: false,
			ref: 'ChatRoom',
		},
		createdById: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdBy: {
			type: 'object',
			optional: true, nullable: false,
			ref: 'UserLite',
		},
		uses: {
			type: 'integer',
			optional: false, nullable: false,
		},
		maxUses: {
			type: 'integer',
			optional: false, nullable: true,
		},
		expiresAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: true,
		},
		revokedAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: true,
		},
	},
} as const;
