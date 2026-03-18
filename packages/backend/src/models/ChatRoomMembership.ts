/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

export const chatRoomMembershipRoles = ['member', 'admin'] as const;
export type ChatRoomMembershipRole = typeof chatRoomMembershipRoles[number];

@Entity('chat_room_membership')
@Index(['userId', 'roomId'], { unique: true })
export class MiChatRoomMembership {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
	})
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Index()
	@Column({
		...id(),
	})
	public roomId: MiChatRoom['id'];

	@ManyToOne(() => MiChatRoom, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public room: MiChatRoom | null;

	@Column('boolean', {
		default: false,
	})
	public isMuted: boolean;

	@Column('timestamp with time zone', {
		nullable: true,
		default: null,
	})
	public speakMutedUntil: Date | null;

	@Column({
		...id(),
		nullable: true,
		default: null,
	})
	public speakMutedById: MiUser['id'] | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
		default: null,
	})
	public speakMuteReason: string | null;

	@Column('varchar', {
		length: 16,
		default: 'member',
	})
	public role: ChatRoomMembershipRole;
}
