/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import pg from 'pg';
import { Redis } from 'ioredis';
import type { Config } from '@/config.js';
import type Logger from '@/logger.js';

const repairKey = 'maintenance:user-note-counts:2026-10-v1';

interface RepairRedis {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<unknown>;
}

/** Count every stored note, including replies, renotes, channel and private notes. */
export async function reconcileUserNoteCounts(client: pg.Client, { apply = false, batchSize = 100 } = {}) {
	if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('Invalid user note count batch size.');
	await client.query(`BEGIN ISOLATION LEVEL REPEATABLE READ${apply ? '' : ' READ ONLY'}`);
	try {
		await client.query("SET LOCAL lock_timeout = '5s'");
		await client.query("SET LOCAL statement_timeout = '30s'");
		if (apply) {
			// Prevent note writes and counter updates while taking the authoritative snapshot.
			// Old servers/workers must still be stopped: their deferred increments can
			// outlive these locks and would otherwise double-count already stored notes.
			await client.query('LOCK TABLE note IN SHARE MODE');
			await client.query('LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE');
		}
		let cursor = '';
		let checked = 0;
		let mismatched = 0;
		for (;;) {
			const { rows } = await client.query<{ id: string; stored: number; actual: number }>(`
				SELECT u.id, u."notesCount" AS stored,
					(SELECT count(*)::int FROM note WHERE "userId" = u.id) AS actual
				FROM "user" u WHERE u.host IS NULL AND u.id > $1 ORDER BY u.id LIMIT $2
			`, [cursor, batchSize]);
			const updates = rows.filter(user => user.stored !== user.actual);
			if (apply && updates.length > 0) {
				await client.query(`
					UPDATE "user" SET "notesCount" = updated.actual
					FROM jsonb_to_recordset($1::jsonb) AS updated(id varchar, actual integer)
					WHERE "user".id = updated.id
				`, [JSON.stringify(updates.map(({ id, actual }) => ({ id, actual })))]);
			}
			checked += rows.length;
			mismatched += updates.length;
			if (rows.length < batchSize) break;
			cursor = rows[rows.length - 1].id;
		}
		await client.query('COMMIT');
		return { checked, mismatched, repaired: apply ? mismatched : 0 };
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	}
}

/** Called before serving requests or starting workers; new master starts are serialized. */
export async function repairUserNoteCounts(client: pg.Client, redis: RepairRedis) {
	await client.query('SELECT pg_advisory_lock(hashtext($1))', [repairKey]);
	try {
		if (await redis.get(repairKey) === 'done') return { skipped: true, checked: 0, mismatched: 0, repaired: 0 };
		const result = await reconcileUserNoteCounts(client, { apply: true });
		// No TTL. If this write fails, the next start safely repeats the reconciliation.
		await redis.set(repairKey, 'done');
		return { skipped: false, ...result };
	} finally {
		await client.query('SELECT pg_advisory_unlock(hashtext($1))', [repairKey]);
	}
}

export async function repairUserNoteCountsOnStartup(config: Config, logger: Logger): Promise<void> {
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
		...config.redis,
		lazyConnect: true,
		retryStrategy: () => null,
		maxRetriesPerRequest: 0,
		connectTimeout: 5000,
	});
	redis.on('error', () => {});
	try {
		await client.connect();
		await redis.connect();
		logger.info('Checking local user note counts before starting servers and workers...');
		const result = await repairUserNoteCounts(client, redis);
		if (!result.skipped) logger.succ(`Local user note counts: checked ${result.checked}, mismatched ${result.mismatched}, repaired ${result.repaired}.`);
	} finally {
		redis.disconnect();
		await client.end();
	}
}
