/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatMessageSchema = {
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
		type: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['message', 'system'],
		},
		fromUserId: {
			type: 'string',
			optional: false, nullable: false,
		},
		fromUser: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserLite',
		},
		toUserId: {
			type: 'string',
			optional: true, nullable: true,
		},
		toUser: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'UserLite',
		},
		toRoomId: {
			type: 'string',
			optional: true, nullable: true,
		},
		toRoom: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'ChatRoom',
		},
		text: {
			type: 'string',
			optional: true, nullable: true,
		},
		fileId: {
			type: 'string',
			optional: true, nullable: true,
		},
		file: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'DriveFile',
		},
		isRead: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		reactions: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					reaction: {
						type: 'string',
						optional: false, nullable: false,
					},
					user: {
						type: 'object',
						optional: false, nullable: false,
						ref: 'UserLite',
					},
				},
			},
		},
		systemEvent: {
			type: 'object',
			optional: true, nullable: true,
			properties: {
				type: {
					type: 'string',
					optional: false, nullable: false,
					enum: ['member_joined', 'member_left', 'invitation_created', 'join_request_accepted', 'member_kicked', 'member_banned', 'member_unbanned', 'member_muted', 'member_unmuted', 'member_promoted', 'member_demoted', 'owner_transferred', 'announcement_updated', 'message_pinned', 'message_unpinned', 'admin_permissions_updated'],
				},
				targetUserId: {
					type: 'string',
					optional: true, nullable: true,
				},
				targetUser: {
					type: 'object',
					optional: true, nullable: true,
					ref: 'UserLite',
				},
				expiresAt: {
					type: 'string',
					format: 'date-time',
					optional: true, nullable: true,
				},
				reason: {
					type: 'string',
					optional: true, nullable: true,
				},
				permissions: {
					type: 'array',
					optional: true, nullable: true,
					items: {
						type: 'string',
						optional: false, nullable: false,
						enum: ['invite', 'approve', 'kick', 'ban', 'mute', 'announcement', 'pin'],
					},
				},
				messageId: {
					type: 'string',
					optional: true, nullable: true,
				},
			},
		},
	},
} as const;

export const packedChatMessageLiteSchema = {
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
		type: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['message', 'system'],
		},
		fromUserId: {
			type: 'string',
			optional: false, nullable: false,
		},
		fromUser: {
			type: 'object',
			optional: true, nullable: false,
			ref: 'UserLite',
		},
		toUserId: {
			type: 'string',
			optional: true, nullable: true,
		},
		toRoomId: {
			type: 'string',
			optional: true, nullable: true,
		},
		text: {
			type: 'string',
			optional: true, nullable: true,
		},
		fileId: {
			type: 'string',
			optional: true, nullable: true,
		},
		file: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'DriveFile',
		},
		reactions: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					reaction: {
						type: 'string',
						optional: false, nullable: false,
					},
					user: {
						type: 'object',
						optional: true, nullable: true,
						ref: 'UserLite',
					},
				},
			},
		},
		systemEvent: {
			type: 'object',
			optional: true, nullable: true,
			properties: {
				type: {
					type: 'string',
					optional: false, nullable: false,
					enum: ['member_joined', 'member_left', 'invitation_created', 'join_request_accepted', 'member_kicked', 'member_banned', 'member_unbanned', 'member_muted', 'member_unmuted', 'member_promoted', 'member_demoted', 'owner_transferred', 'announcement_updated', 'message_pinned', 'message_unpinned', 'admin_permissions_updated'],
				},
				targetUserId: {
					type: 'string',
					optional: true, nullable: true,
				},
				targetUser: {
					type: 'object',
					optional: true, nullable: true,
					ref: 'UserLite',
				},
				expiresAt: {
					type: 'string',
					format: 'date-time',
					optional: true, nullable: true,
				},
				reason: {
					type: 'string',
					optional: true, nullable: true,
				},
				permissions: {
					type: 'array',
					optional: true, nullable: true,
					items: {
						type: 'string',
						optional: false, nullable: false,
						enum: ['invite', 'approve', 'kick', 'ban', 'mute', 'announcement', 'pin'],
					},
				},
				messageId: {
					type: 'string',
					optional: true, nullable: true,
				},
			},
		},
	},
} as const;

export const packedChatMessageLiteFor1on1Schema = {
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
		type: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['message', 'system'],
		},
		fromUserId: {
			type: 'string',
			optional: false, nullable: false,
		},
		toUserId: {
			type: 'string',
			optional: false, nullable: false,
		},
		text: {
			type: 'string',
			optional: true, nullable: true,
		},
		fileId: {
			type: 'string',
			optional: true, nullable: true,
		},
		file: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'DriveFile',
		},
		reactions: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					reaction: {
						type: 'string',
						optional: false, nullable: false,
					},
				},
			},
		},
		systemEvent: {
			type: 'object',
			optional: true, nullable: true,
			properties: {
				type: {
					type: 'string',
					optional: false, nullable: false,
					enum: ['member_joined', 'member_left', 'invitation_created', 'join_request_accepted', 'member_kicked', 'member_banned', 'member_unbanned', 'member_muted', 'member_unmuted', 'member_promoted', 'member_demoted', 'owner_transferred', 'announcement_updated', 'message_pinned', 'message_unpinned', 'admin_permissions_updated'],
				},
				targetUserId: {
					type: 'string',
					optional: true, nullable: true,
				},
				targetUser: {
					type: 'object',
					optional: true, nullable: true,
					ref: 'UserLite',
				},
				expiresAt: {
					type: 'string',
					format: 'date-time',
					optional: true, nullable: true,
				},
				reason: {
					type: 'string',
					optional: true, nullable: true,
				},
				permissions: {
					type: 'array',
					optional: true, nullable: true,
					items: {
						type: 'string',
						optional: false, nullable: false,
						enum: ['invite', 'approve', 'kick', 'ban', 'mute', 'announcement', 'pin'],
					},
				},
				messageId: {
					type: 'string',
					optional: true, nullable: true,
				},
			},
		},
	},
} as const;

export const packedChatMessageLiteForRoomSchema = {
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
		type: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['message', 'system'],
		},
		fromUserId: {
			type: 'string',
			optional: false, nullable: false,
		},
		fromUser: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserLite',
		},
		toRoomId: {
			type: 'string',
			optional: false, nullable: false,
		},
		text: {
			type: 'string',
			optional: true, nullable: true,
		},
		fileId: {
			type: 'string',
			optional: true, nullable: true,
		},
		file: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'DriveFile',
		},
		reactions: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					reaction: {
						type: 'string',
						optional: false, nullable: false,
					},
					user: {
						type: 'object',
						optional: false, nullable: false,
						ref: 'UserLite',
					},
				},
			},
		},
		systemEvent: {
			type: 'object',
			optional: true, nullable: true,
			properties: {
				type: {
					type: 'string',
					optional: false, nullable: false,
					enum: ['member_joined', 'member_left', 'invitation_created', 'join_request_accepted', 'member_kicked', 'member_banned', 'member_unbanned', 'member_muted', 'member_unmuted', 'member_promoted', 'member_demoted', 'owner_transferred', 'announcement_updated', 'message_pinned', 'message_unpinned', 'admin_permissions_updated'],
				},
				targetUserId: {
					type: 'string',
					optional: true, nullable: true,
				},
				targetUser: {
					type: 'object',
					optional: true, nullable: true,
					ref: 'UserLite',
				},
				expiresAt: {
					type: 'string',
					format: 'date-time',
					optional: true, nullable: true,
				},
				reason: {
					type: 'string',
					optional: true, nullable: true,
				},
				permissions: {
					type: 'array',
					optional: true, nullable: true,
					items: {
						type: 'string',
						optional: false, nullable: false,
						enum: ['invite', 'approve', 'kick', 'ban', 'mute', 'announcement', 'pin'],
					},
				},
				messageId: {
					type: 'string',
					optional: true, nullable: true,
				},
			},
		},
	},
} as const;
