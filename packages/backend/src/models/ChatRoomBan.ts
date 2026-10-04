/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_room_ban')
@Index('IDX_635ecfd77ff4b74053c9e6f4eb', ['roomId', 'userId'], { unique: true })
export class MiChatRoomBan {
	@PrimaryColumn(id())
	public id: string;

	@Index('IDX_15375f6f4ff19483e5b1ef95d9')
	@Column({
		...id(),
	})
	public roomId: MiChatRoom['id'];

	@ManyToOne(() => MiChatRoom, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ foreignKeyConstraintName: 'FK_15375f6f4ff19483e5b1ef95d96' })
	public room: MiChatRoom | null;

	@Index('IDX_41ec4b7c539bafbd1379c91bc5')
	@Column({
		...id(),
	})
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ foreignKeyConstraintName: 'FK_41ec4b7c539bafbd1379c91bc58' })
	public user: MiUser | null;

	@Index('IDX_0f6f5d3605be7f73b1562c4d34')
	@Column({
		...id(),
	})
	public createdById: MiUser['id'];

	@Column('varchar', {
		length: 1024,
		nullable: true,
		default: null,
	})
	public reason: string | null;

	@Column('timestamp with time zone', {
		nullable: true,
		default: null,
	})
	public expiresAt: Date | null;
}
