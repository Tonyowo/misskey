/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatRoomSchema = {
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
		ownerId: {
			type: 'string',
			optional: false, nullable: false,
		},
		owner: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserLite',
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		description: {
			type: 'string',
			optional: false, nullable: false,
		},
		joinPolicy: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['invite_only', 'request_required', 'public'],
		},
		discoverability: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['private', 'unlisted', 'public'],
		},
		avatarFileId: {
			type: 'string',
			optional: false, nullable: true,
		},
		memberCanInvite: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		allowJoinRequest: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		maxMembers: {
			type: 'integer',
			optional: false, nullable: false,
		},
		isMuted: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		isJoined: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		myRole: {
			type: 'string',
			optional: true, nullable: true,
			enum: ['owner', 'admin', 'member'],
		},
		canInvite: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		canManageMembers: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		canManageAdmins: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		invitationExists: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		joinRequestExists: {
			type: 'boolean',
			optional: true, nullable: false,
		},
	},
} as const;
