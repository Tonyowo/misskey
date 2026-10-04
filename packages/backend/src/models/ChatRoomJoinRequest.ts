/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_room_join_request')
@Index('IDX_4ca88ce9c07e073ab2d7e01f1b', ['roomId', 'userId'], { unique: true })
export class MiChatRoomJoinRequest {
	@PrimaryColumn(id())
	public id: string;

	@Index('IDX_f9a90bcb8604482ee4dffea32a')
	@Column({
		...id(),
	})
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ foreignKeyConstraintName: 'FK_f9a90bcb8604482ee4dffea32ae' })
	public user: MiUser | null;

	@Index('IDX_b384b754fba34a7e50f1173f6c')
	@Column({
		...id(),
	})
	public roomId: MiChatRoom['id'];

	@ManyToOne(() => MiChatRoom, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ foreignKeyConstraintName: 'FK_b384b754fba34a7e50f1173f6ce' })
	public room: MiChatRoom | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
		default: null,
	})
	public message: string | null;
}
