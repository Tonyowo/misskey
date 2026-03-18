/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_room_invite_link')
export class MiChatRoomInviteLink {
	@PrimaryColumn(id())
	public id: string;

	@Index({ unique: true })
	@Column('varchar', {
		length: 64,
	})
	public code: string;

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

	@Index()
	@Column({
		...id(),
	})
	public createdById: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public createdBy: MiUser | null;

	@Column('integer', {
		default: 0,
	})
	public uses: number;

	@Column('integer', {
		nullable: true,
		default: null,
	})
	public maxUses: number | null;

	@Column('timestamp with time zone', {
		nullable: true,
		default: null,
	})
	public expiresAt: Date | null;

	@Column('timestamp with time zone', {
		nullable: true,
		default: null,
	})
	public revokedAt: Date | null;
}
