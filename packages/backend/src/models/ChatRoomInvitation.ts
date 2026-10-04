/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_room_invitation')
@Index(['userId', 'roomId'], { unique: true })
export class MiChatRoomInvitation {
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

	@Index('IDX_3a6abe5727b7d2660fd4fcca31')
	@Column({
		...id(),
	})
	public createdById: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_3a6abe5727b7d2660fd4fcca317' })
	public createdBy: MiUser | null;

	@Column('boolean', {
		default: false,
	})
	public ignored: boolean;

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
