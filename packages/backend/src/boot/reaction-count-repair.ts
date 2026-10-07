/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import pg from 'pg';
import { Redis } from 'ioredis';
import type { Config } from '@/config.js';
import type Logger from '@/logger.js';
import { PER_NOTE_REACTION_USER_PAIR_CACHE_MAX } from '@/const.js';

const repairKey = 'maintenance:reaction-counts:2026-10-v1';

interface RepairRedis {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<unknown>;
	del(...keys: string[]): Promise<number>;
}

function sameCounts(a: Record<string, number>, b: Record<string, number>): boolean {
	return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => b[key] === value);
}

/** Run before any servers/workers start. All old instance processes must be stopped. */
export async function repairReactionCounts(client: pg.Client, redis: RepairRedis, batchSize = 100) {
	if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('Invalid reaction repair batch size.');
	await client.query('SELECT pg_advisory_lock(hashtext($1))', [repairKey]);
	try {
		if (await redis.get(repairKey) === 'done') return { skipped: true, checked: 0, repaired: 0 };
		let cursor = '';
		let checked = 0;
		let repaired = 0;
		for (;;) {
			await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
			try {
				await client.query("SET LOCAL lock_timeout = '5s'");
				await client.query("SET LOCAL statement_timeout = '30s'");
				await client.query('LOCK TABLE note_reaction IN SHARE MODE');
				const { rows } = await client.query<{
					id: string;
					reactions: Record<string, number>;
					actual: Record<string, number>;
					reactionAndUserPairCache: string[];
					pairs: string[];
				}>(`
					SELECT note.id, note.reactions, note."reactionAndUserPairCache",
						COALESCE((SELECT jsonb_object_agg(reaction, total) FROM (
							SELECT reaction, count(*)::int AS total FROM note_reaction
							WHERE "noteId" = note.id GROUP BY reaction
						) counts), '{}'::jsonb) AS actual,
						ARRAY(SELECT "userId" || '/' || reaction FROM note_reaction WHERE "noteId" = note.id ORDER BY id DESC LIMIT $3) AS pairs
					FROM note
					WHERE "userHost" IS NULL AND id > $1
					ORDER BY id LIMIT $2 FOR UPDATE OF note
				`, [cursor, batchSize, PER_NOTE_REACTION_USER_PAIR_CACHE_MAX]);
				const updates: { id: string; reactions: Record<string, number>; pairs: string[] }[] = [];
				for (const note of rows) {
					if (!sameCounts(note.reactions, note.actual) || note.reactionAndUserPairCache.join('\n') !== note.pairs.join('\n')) {
						updates.push({ id: note.id, reactions: note.actual, pairs: note.pairs });
					}
				}
				if (updates.length > 0) {
					await client.query(`
						UPDATE note SET reactions = updated.reactions, "reactionAndUserPairCache" = updated.pairs
						FROM jsonb_to_recordset($1::jsonb) AS updated(id varchar, reactions jsonb, pairs varchar[])
						WHERE note.id = updated.id
					`, [JSON.stringify(updates)]);
				}
				if (rows.length > 0) {
					// Reaction rows already include queued changes. Absorb and remove their
					// buffers before commit so a later bake cannot count them twice.
					// If this batch fails/crashes, no completion marker is written; startup
					// must retry from the authoritative rows before serving any requests.
					await redis.del(...rows.flatMap(note => [`reactionsBufferDeltas:${note.id}`, `reactionsBufferPairs:${note.id}`]));
				}
				await client.query('COMMIT');
				checked += rows.length;
				repaired += updates.length;
				if (rows.length < batchSize) break;
				cursor = rows[rows.length - 1].id;
			} catch (error) {
				await client.query('ROLLBACK');
				throw error;
			}
		}
		// No TTL: ordinary restarts must not repeat the historical scan.
		await redis.set(repairKey, 'done');
		return { skipped: false, checked, repaired };
	} finally {
		await client.query('SELECT pg_advisory_unlock(hashtext($1))', [repairKey]);
	}
}

export async function repairReactionCountsOnStartup(config: Config, logger: Logger): Promise<void> {
	// Test servers have their own database reset lifecycle.
	if (process.env.NODE_ENV === 'test') return;
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
		logger.info('Checking historical reaction counts before starting servers and workers...');
		const result = await repairReactionCounts(client, redis);
		if (!result.skipped) logger.succ(`Historical reaction counts repaired: ${result.repaired} of ${result.checked} local notes updated.`);
	} finally {
		redis.disconnect();
		await client.end();
	}
}
