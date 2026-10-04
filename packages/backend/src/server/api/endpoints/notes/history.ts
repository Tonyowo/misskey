/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, LessThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiNote } from '@/models/Note.js';
import { MiNoteRevision } from '@/models/NoteRevision.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],
	requireCredential: false,
	limit: { duration: 60000, max: 60 },
	res: {
		type: 'array', optional: false, nullable: false,
		items: {
			type: 'object', optional: false, nullable: false,
			properties: {
				id: { type: 'string', optional: false, nullable: false, format: 'id' },
				revision: { type: 'number', optional: false, nullable: false },
				createdAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
				note: { type: 'object', optional: false, nullable: false, ref: 'Note' },
			},
		},
	},
	errors: {
		noSuchNote: { message: 'No such note.', code: 'NO_SUCH_NOTE', id: 'e2249994-7e43-4072-8b7d-e6220e8bfb65' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
	},
	required: ['noteId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db) private db: DataSource,
		private noteEntityService: NoteEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const current = await this.db.getRepository(MiNote).findOneBy({ id: ps.noteId });
			if (current == null || !await this.noteEntityService.isVisibleForMe(current, me?.id ?? null) || (await this.noteEntityService.pack(current, me)).isHidden) {
				throw new ApiError(meta.errors.noSuchNote);
			}
			const repository = this.db.getRepository(MiNoteRevision);
			const cursor = ps.untilId ? await repository.findOneBy({ id: ps.untilId, noteId: current.id }) : null;
			if (ps.untilId && !cursor) return [];
			const revisions = await repository.find({
				where: { noteId: current.id, ...(cursor ? { revision: LessThan(cursor.revision) } : {}) },
				order: { revision: 'DESC' }, take: ps.limit,
			});
			// Permission is based on the current post. Historical hidden blocks are author-only,
			// even if a viewer can reveal the current post after commenting.
			const notes = revisions.map(version => ({
				...current, ...version.snapshot, revision: version.revision,
				updatedAt: version.createdAt,
				replyVisibleContents: current.userId === me?.id ? version.snapshot.replyVisibleContents : [],
			}));
			const packed = await this.noteEntityService.packMany(notes, me);
			return revisions.map((version, index) => ({
				id: version.id, revision: version.revision,
				createdAt: version.createdAt.toISOString(), note: packed[index],
			}));
		});
	}
}
