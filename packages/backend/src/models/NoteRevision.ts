/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiNote } from './Note.js';
import type { IReplyVisibleContent } from './Note.js';

export type NoteRevisionSnapshot = {
	text: string | null;
	cw: string | null;
	fileIds: string[];
	reactionAcceptance: MiNote['reactionAcceptance'];
	replyVisibleContents: IReplyVisibleContent[];
};

@Entity('note_revision')
@Index('IDX_note_revision_note_revision', ['noteId', 'revision'], { unique: true })
@Index('IDX_note_revision_note_id', ['noteId', 'id'])
export class MiNoteRevision {
	@PrimaryColumn(id())
	public id: string;

	@Column(id())
	public noteId: MiNote['id'];

	@ManyToOne(() => MiNote, { onDelete: 'CASCADE' })
	@JoinColumn()
	public note: MiNote | null;

	@Column('integer')
	public revision: number;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('integer', { default: 1 })
	public schemaVersion: number;

	@Column('jsonb')
	public snapshot: NoteRevisionSnapshot;
}
