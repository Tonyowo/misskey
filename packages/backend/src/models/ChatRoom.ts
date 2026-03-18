/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export const chatRoomJoinPolicies = ['invite_only', 'request_required', 'public'] as const;
export type ChatRoomJoinPolicy = typeof chatRoomJoinPolicies[number];

export const chatRoomDiscoverabilities = ['private', 'unlisted', 'public'] as const;
export type ChatRoomDiscoverability = typeof chatRoomDiscoverabilities[number];

export const chatRoomAdminPermissions = ['invite', 'approve', 'kick', 'ban', 'mute', 'announcement', 'pin'] as const;
export type ChatRoomAdminPermission = typeof chatRoomAdminPermissions[number];

@Entity('chat_room')
export class MiChatRoom {
	@PrimaryColumn(id())
	public id: string;

	@Column('varchar', {
		length: 256,
	})
	public name: string;

	@Index()
	@Column({
		...id(),
	})
	public ownerId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public owner: MiUser | null;

	@Column('varchar', {
		length: 2048, default: '',
	})
	public description: string;

	@Column('varchar', {
		length: 4096,
		default: '',
	})
	public announcement: string;

	@Column('varchar', {
		length: 16,
		default: 'invite_only',
	})
	public joinPolicy: ChatRoomJoinPolicy;

	@Column('varchar', {
		length: 16,
		default: 'private',
	})
	public discoverability: ChatRoomDiscoverability;

	@Column('varchar', {
		...id(),
		nullable: true,
		default: null,
	})
	public avatarFileId: string | null;

	@Column('varchar', {
		...id(),
		nullable: true,
		default: null,
	})
	public pinnedMessageId: string | null;

	@Column('boolean', {
		default: false,
	})
	public memberCanInvite: boolean;

	@Column('varchar', {
		length: 32,
		array: true,
		default: chatRoomAdminPermissions,
	})
	public adminPermissions: ChatRoomAdminPermission[];

	@Column('boolean', {
		default: true,
	})
	public allowJoinRequest: boolean;

	@Column('integer', {
		default: 50,
	})
	public maxMembers: number;

	@Column('boolean', {
		default: false,
	})
	public isArchived: boolean;
}
