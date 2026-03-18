/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiDriveFile } from './DriveFile.js';
import { MiChatRoom } from './ChatRoom.js';
import type { ChatRoomAdminPermission } from './ChatRoom.js';

export const chatMessageTypes = ['message', 'system'] as const;
export type ChatMessageType = typeof chatMessageTypes[number];

export const chatMessageSystemEventTypes = [
	'member_joined',
	'member_left',
	'invitation_created',
	'join_request_accepted',
	'member_kicked',
	'member_banned',
	'member_unbanned',
	'member_muted',
	'member_unmuted',
	'member_promoted',
	'member_demoted',
	'owner_transferred',
	'announcement_updated',
	'message_pinned',
	'message_unpinned',
	'admin_permissions_updated',
] as const;
export type ChatMessageSystemEventType = typeof chatMessageSystemEventTypes[number];

export type ChatMessageSystemEvent = {
	type: ChatMessageSystemEventType;
	targetUserId?: MiUser['id'] | null;
	expiresAt?: Date | string | null;
	reason?: string | null;
	permissions?: ChatRoomAdminPermission[] | null;
	messageId?: MiChatMessage['id'] | null;
};

@Entity('chat_message')
export class MiChatMessage {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
	})
	public fromUserId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public fromUser: MiUser | null;

	@Index()
	@Column({
		...id(), nullable: true,
	})
	public toUserId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public toUser: MiUser | null;

	@Index()
	@Column({
		...id(), nullable: true,
	})
	public toRoomId: MiChatRoom['id'] | null;

	@ManyToOne(() => MiChatRoom, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public toRoom: MiChatRoom | null;

	@Column('varchar', {
		length: 16,
		default: 'message',
	})
	public type: ChatMessageType;

	@Column('varchar', {
		length: 4096, nullable: true,
	})
	public text: string | null;

	@Column('varchar', {
		length: 512, nullable: true,
	})
	public uri: string | null;

	@Column({
		...id(),
		array: true, default: '{}',
	})
	public reads: MiUser['id'][];

	@Column({
		...id(),
		nullable: true,
	})
	public fileId: MiDriveFile['id'] | null;

	@ManyToOne(() => MiDriveFile, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public file: MiDriveFile | null;

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public reactions: string[];

	@Column('jsonb', {
		nullable: true,
		default: null,
	})
	public systemEvent: ChatMessageSystemEvent | null;
}
