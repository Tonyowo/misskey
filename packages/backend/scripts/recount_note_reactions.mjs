/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export function parseOptions(args) {
	const { values } = parseArgs({
		args,
		options: {
			'note-id': { type: 'string', multiple: true },
			apply: { type: 'boolean', default: false },
			maintenance: { type: 'boolean', default: false },
			backup: { type: 'string' },
			help: { type: 'boolean' },
		},
	});
	const noteIds = [...new Set(values['note-id'] ?? [])];
	if (!values.help && noteIds.length === 0) throw new Error('At least one --note-id is required.');
	if (values.apply && !values.maintenance) throw new Error('--apply requires --maintenance: stop all Misskey server and worker processes first.');
	return { ...values, noteIds };
}

/**
 * Rebuild only the requested notes, using raw SQL without ORM schema synchronization.
 * @param {{ apply?: boolean; maintenance?: boolean; backupPath?: string; cacheLimit: number }} options
 */
export async function recountNoteReactions(client, redis, noteIds, options) {
	const { apply = false, maintenance = false, cacheLimit } = options;
	let { backupPath } = options;
	if (noteIds.length === 0) throw new Error('At least one note ID is required.');
	if (apply && !maintenance) throw new Error('Stop all Misskey server and worker processes before applying a recount.');
	if (!Number.isInteger(cacheLimit) || cacheLimit < 1) throw new Error('Invalid reaction cache limit.');
	const ids = [...new Set(noteIds)].sort();
	const bufferKeys = ids.flatMap(id => [`reactionsBufferDeltas:${id}`, `reactionsBufferPairs:${id}`]);
	await client.query(apply ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
	try {
		await client.query("SET LOCAL lock_timeout = '5s'");
		await client.query("SET LOCAL statement_timeout = '30s'");
		// Maintenance is necessary because ReactionService writes rows and counts separately.
		if (apply) await client.query('LOCK TABLE note_reaction IN SHARE MODE');
		const { rows: before } = await client.query(`
			SELECT id, "userHost", reactions, "reactionAndUserPairCache"
			FROM note WHERE id = ANY($1::varchar[]) ORDER BY id ${apply ? 'FOR UPDATE' : ''}
		`, [ids]);
		if (before.length !== ids.length) throw new Error('Some requested notes do not exist; no notes were changed.');
		if (before.some(note => note.userHost != null)) throw new Error('Only local notes can be recounted; remote reaction records may be incomplete.');
		const pendingBuffers = await redis.exists(...bufferKeys);
		if (apply && pendingBuffers > 0) throw new Error('Pending reaction buffers exist. Flush them with the fixed Misskey version before stopping the server and workers, then retry.');

		const notes = [];
		for (const note of before) {
			const { rows: [rebuilt] } = await client.query(`
				SELECT
					COALESCE((SELECT jsonb_object_agg(reaction, total) FROM (
						SELECT reaction, count(*)::int AS total FROM note_reaction WHERE "noteId" = $1 GROUP BY reaction
					) counts), '{}'::jsonb) AS reactions,
					ARRAY(SELECT "userId" || '/' || reaction FROM note_reaction WHERE "noteId" = $1 ORDER BY id DESC LIMIT $2) AS pairs
			`, [note.id, cacheLimit]);
			notes.push({ id: note.id, before: note.reactions, after: rebuilt.reactions, cachedUsers: rebuilt.pairs.length });
			if (apply) {
				// Save all original values before the first write, including the bounded user cache.
				if (notes.length === 1) {
					backupPath ??= join(tmpdir(), `misskey-reactions-${randomUUID()}.json`);
					await writeFile(backupPath, `${JSON.stringify({ createdAt: new Date().toISOString(), notes: before }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
				}
				await client.query('UPDATE note SET reactions = $2::jsonb, "reactionAndUserPairCache" = $3::varchar[] WHERE id = $1', [note.id, JSON.stringify(rebuilt.reactions), rebuilt.pairs]);
			}
		}
		if (apply && await redis.exists(...bufferKeys) > 0) throw new Error('Reaction buffers changed during the recount; the database transaction was rolled back.');
		await client.query('COMMIT');
		return { applied: apply, pendingBuffers, ...(apply ? { backupPath } : {}), notes };
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	}
}

async function main() {
	const options = parseOptions(process.argv.slice(2));
	if (options.help) {
		console.log('Usage: node scripts/recount_note_reactions.mjs --note-id ID [--note-id ID] [--apply --maintenance] [--backup PATH]\nDefault: read-only comparison. Applying requires all Misskey server and worker processes to be stopped and the selected notes to have no pending reaction buffers.');
		return;
	}
	const [{ default: pg }, { default: Redis }, { loadConfig }, { PER_NOTE_REACTION_USER_PAIR_CACHE_MAX }] = await Promise.all([
		import('pg'), import('ioredis'), import('../built/config.js'), import('../built/const.js'),
	]);
	const config = loadConfig();
	const client = new pg.Client({
		host: config.db.host,
		port: config.db.port,
		user: config.db.user,
		password: config.db.pass,
		database: config.db.db,
		...config.db.extra,
		connectionTimeoutMillis: 5000,
	});
	const redis = new Redis({
		...config.redisForReactions,
		lazyConnect: true,
		retryStrategy: () => null,
		maxRetriesPerRequest: 0,
		connectTimeout: 5000,
	});
	redis.on('error', () => {});
	try {
		await client.connect();
		await redis.connect();
		console.log(JSON.stringify(await recountNoteReactions(client, redis, options.noteIds, {
			apply: options.apply,
			maintenance: options.maintenance,
			backupPath: options.backup ? resolve(options.backup) : undefined,
			cacheLimit: PER_NOTE_REACTION_USER_PAIR_CACHE_MAX,
		}), null, 2));
	} finally {
		redis.disconnect();
		await client.end();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch(error => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
