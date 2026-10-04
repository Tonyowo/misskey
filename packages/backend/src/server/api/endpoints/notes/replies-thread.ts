/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiNote } from '@/models/Note.js';
import { IdService } from '@/core/IdService.js';
import { shouldHideNoteByTime } from '@/misc/should-hide-note-by-time.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['notes'], requireCredential: false,
	limit: { duration: 60000, max: 60 },
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			items: { type: 'array', optional: false, nullable: false, items: { type: 'object', optional: false, nullable: false, ref: 'Note' } },
			nextCursor: { type: 'string', optional: false, nullable: true, format: 'id' },
			hasMore: { type: 'boolean', optional: false, nullable: false },
			truncated: { type: 'boolean', optional: false, nullable: false },
		},
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
		private queryService: QueryService,
		private idService: IdService,
		private noteEntityService: NoteEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const repository = this.db.getRepository(MiNote);
			const visible = repository.createQueryBuilder('note').select('note.id')
				.innerJoin('note.user', 'user')
				.leftJoin('note.reply', 'reply')
				.leftJoin('reply.user', 'replyUser')
				.leftJoin('note.renote', 'renote')
				.leftJoin('renote.user', 'renoteUser')
				.where('note.id = child.id');
			this.queryService.generateVisibilityQuery(visible, me);
			this.queryService.generateBaseNoteFilteringQuery(visible, me);
			// Visibility is tested before traversal, so a hidden node cannot bridge to descendants.
			// The visited path also protects installations containing malformed reply cycles.
			const cte = (pruneHidden: boolean) => `WITH RECURSIVE thread AS (
				SELECT child.id, ARRAY[child.id]::varchar[] AS path, 0 AS depth
				FROM note child WHERE child.id = :rootId AND EXISTS (${visible.getQuery()})
				${pruneHidden ? 'AND NOT child.id = ANY(:hiddenIds)' : ''}
				UNION ALL
				SELECT child.id, thread.path || child.id, thread.depth + 1
				FROM thread JOIN note child ON child."replyId" = thread.id
				WHERE thread.depth < ${pruneHidden ? 100 : 101} AND NOT child.id = ANY(thread.path)
				AND EXISTS (${visible.getQuery()})
				${pruneHidden ? 'AND NOT child.id = ANY(:hiddenIds)' : ''}
			)`;
			// IDs encode creation time in several configurable formats. Parse them through
			// IdService instead of comparing a randomly generated cutoff ID. Only policy
			// metadata is fetched here; hidden content never leaves the database.
			const rows = await this.db.transaction('REPEATABLE READ', async manager => {
				const execute = async <T>(sql: string, extra = {}) => {
					const [query, parameters] = this.db.driver.escapeQueryWithParameters(sql, {
						...visible.getParameters(), rootId: ps.noteId, viewerId: me?.id ?? null,
						untilId: ps.untilId, fetchLimit: ps.limit + 1, ...extra,
					});
					return await manager.query(query, parameters) as T[];
				};
				const policies = await execute<{
					id: string; userId: string; visibility: string; mentions: string[]; replyUserId: string | null;
					requireSigninToViewContents: boolean; makeNotesHiddenBefore: number | null;
					makeNotesFollowersOnlyBefore: number | null; follows: boolean;
				}>(`${cte(false)} SELECT child.id, child."userId", child.visibility, child.mentions, child."replyUserId",
					owner."requireSigninToViewContents", owner."makeNotesHiddenBefore", owner."makeNotesFollowersOnlyBefore",
					EXISTS (SELECT 1 FROM following WHERE "followerId" = :viewerId AND "followeeId" = owner.id) AS follows
					FROM thread JOIN note child ON child.id = thread.id JOIN "user" owner ON owner.id = child."userId"`);
				const hiddenIds = policies.filter(policy => {
					if (policy.userId === me?.id) return false;
					const date = this.idService.parse(policy.id).date;
					if ((!me && policy.requireSigninToViewContents) || shouldHideNoteByTime(policy.makeNotesHiddenBefore, date)) return true;
					return ['public', 'home'].includes(policy.visibility)
						&& shouldHideNoteByTime(policy.makeNotesFollowersOnlyBefore, date)
						&& (!me || (policy.replyUserId !== me.id && !policy.mentions.includes(me.id) && !policy.follows));
				}).map(policy => policy.id);
				return execute<{ id: string; truncated: boolean }>(`${cte(true)}
					SELECT id, EXISTS (SELECT 1 FROM thread edge JOIN note child ON child."replyId" = edge.id
						WHERE edge.depth = 100 AND NOT child.id = ANY(edge.path) AND NOT child.id = ANY(:hiddenIds)
						AND EXISTS (${visible.getQuery()})) AS truncated
					FROM thread WHERE depth > 0 ${ps.untilId ? 'AND id < :untilId' : ''}
					ORDER BY id DESC LIMIT :fetchLimit`, { hiddenIds });
			});
			const selected = rows.slice(0, ps.limit);
			const notes = selected.length ? await repository.findBy({ id: In(selected.map(row => row.id)) }) : [];
			const byId = new Map(notes.map(note => [note.id, note]));
			const ordered = selected.map(row => byId.get(row.id)).filter((note): note is MiNote => note != null);
			return {
				items: await this.noteEntityService.packMany(ordered, me),
				nextCursor: rows.length > ps.limit ? selected.at(-1)!.id : null,
				hasMore: rows.length > ps.limit, truncated: rows.some(row => row.truncated),
			};
		});
	}
}
