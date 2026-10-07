/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import pg from 'pg';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '@/config.js';
import { repairReactionCounts } from '@/boot/reaction-count-repair.js';

describe('automatic historical reaction count repair', () => {
	const config = loadConfig();
	const connection = { host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.pass, database: config.db.db };
	const client = new pg.Client(connection);
	const state = new Map<string, string>();
	const buffers = new Map<string, Record<string, string>>();
	const redis = {
		get: vi.fn(async (key: string) => state.get(key) ?? null),
		set: vi.fn(async (key: string, value: string) => { state.set(key, value); return 'OK' as const; }),
		del: vi.fn(async (...keys: string[]) => {
			for (const key of keys) buffers.delete(key);
			return keys.length;
		}),
	};
	const initial = { '😍': 5, ':dacall:': 3, '😀': 2, '🤙': 1 };
	const actual = { '😍': 10, ':dacall:': 4, '😀': 1, '🤙': 3 };
	const readCounts = async (id = 'target') => (await client.query('SELECT reactions FROM note WHERE id = $1', [id])).rows[0].reactions;

	beforeAll(async () => {
		await client.connect();
		await client.query('CREATE TEMPORARY TABLE note (id varchar PRIMARY KEY, "userHost" varchar, reactions jsonb NOT NULL, "reactionAndUserPairCache" varchar[] NOT NULL DEFAULT ARRAY[]::varchar[])');
		await client.query('CREATE TEMPORARY TABLE note_reaction (id varchar PRIMARY KEY, "noteId" varchar NOT NULL, reaction varchar NOT NULL, "userId" varchar NOT NULL)');
	});

	beforeEach(async () => {
		await client.query('TRUNCATE note, note_reaction');
		await client.query(`INSERT INTO note (id, "userHost", reactions) VALUES ('target', NULL, $1::jsonb), ('empty', NULL, '{"👍":4}'), ('remote', 'remote.example', '{"❤":99}'), ('missing-count', NULL, '{}'), ('untouched', NULL, '{}')`, [JSON.stringify(initial)]);
		for (const [reaction, count] of Object.entries(actual)) {
			for (let i = 0; i < count; i++) {
				await client.query('INSERT INTO note_reaction VALUES ($1, $2, $3, $4)', [`${reaction}${i}`, 'target', reaction, `user${reaction}${i}`]);
			}
		}
		await client.query("INSERT INTO note_reaction VALUES ('missing-row', 'missing-count', '❤', 'user-missing')");
		state.clear();
		buffers.clear();
		vi.clearAllMocks();
	});

	afterAll(async () => { await client.end(); });

	test('repairs historical counts across batches, including empty and missing aggregates, while preserving remote notes', async () => {
		expect(await repairReactionCounts(client, redis, 1)).toEqual({ skipped: false, checked: 4, repaired: 3 });
		expect(await readCounts()).toEqual(actual);
		expect(await readCounts('empty')).toEqual({});
		expect(await readCounts('missing-count')).toEqual({ '❤': 1 });
		expect(await readCounts('remote')).toEqual({ '❤': 99 });
		expect((await client.query("SELECT cardinality(\"reactionAndUserPairCache\") AS total FROM note WHERE id = 'target'")).rows[0].total).toBe(16);
		expect(redis.set).toHaveBeenCalledOnce();
	});

	test('skips ordinary restarts once the repair is complete', async () => {
		await repairReactionCounts(client, redis);
		redis.del.mockClear();
		expect(await repairReactionCounts(client, redis)).toEqual({ skipped: true, checked: 0, repaired: 0 });
		expect(redis.del).not.toHaveBeenCalled();
	});

	test('absorbs pending increases and decreases and removes their buffers before serving requests', async () => {
		buffers.set('reactionsBufferDeltas:target', { '😍': '3', '😀': '-1' });
		buffers.set('reactionsBufferPairs:target', { stale: '1' });
		buffers.set('reactionsBufferDeltas:remote', { '❤': '5' });
		await repairReactionCounts(client, redis);
		expect(await readCounts()).toEqual(actual);
		expect(buffers.has('reactionsBufferDeltas:target')).toBe(false);
		expect(buffers.has('reactionsBufferPairs:target')).toBe(false);
		expect(buffers.get('reactionsBufferDeltas:remote')).toEqual({ '❤': '5' });
	});

	test('rolls back a failed batch and retries without marking partial work as complete', async () => {
		redis.del.mockRejectedValueOnce(new Error('Redis unavailable'));
		await expect(repairReactionCounts(client, redis, 100)).rejects.toThrow('Redis unavailable');
		expect(await readCounts()).toEqual(initial);
		expect(redis.set).not.toHaveBeenCalled();
		await repairReactionCounts(client, redis, 1);
		expect(await readCounts()).toEqual(actual);
		expect(redis.set).toHaveBeenCalledOnce();
	});

	test('is idempotent even if the completion marker is lost', async () => {
		await repairReactionCounts(client, redis);
		state.clear();
		expect((await repairReactionCounts(client, redis)).repaired).toBe(0);
		expect(await readCounts()).toEqual(actual);
	});

	test('serializes concurrent master starts until the first repair completes', async () => {
		const secondClient = new pg.Client(connection);
		await secondClient.connect();
		const { rows: [{ pid }] } = await secondClient.query('SELECT pg_backend_pid() AS pid');
		let resume!: () => void;
		redis.del.mockImplementationOnce(() => new Promise(resolve => { resume = () => resolve(0); }));
		try {
			const first = repairReactionCounts(client, redis);
			await vi.waitFor(() => expect(redis.del).toHaveBeenCalled());
			const second = repairReactionCounts(secondClient, redis);
			await vi.waitFor(async () => {
				await client.query('SELECT pg_stat_clear_snapshot()');
				const { rows } = await client.query('SELECT wait_event FROM pg_stat_activity WHERE pid = $1', [pid]);
				expect(rows[0].wait_event).toBe('advisory');
			});
			resume();
			const [firstResult, secondResult] = await Promise.all([first, second]);
			expect(firstResult.repaired).toBe(3);
			// The second connection has no access to the first one's temporary tables.
			// Reaching the completion marker, without querying them, proves startup ordering.
			expect(secondResult.skipped).toBe(true);
		} finally {
			await secondClient.end();
		}
	});

	test('recovers from a failure after Redis buffers were already cleared', async () => {
		buffers.set('reactionsBufferDeltas:target', { '😍': '3' });
		redis.del.mockImplementationOnce(async (...keys: string[]) => {
			for (const key of keys) buffers.delete(key);
			throw new Error('connection lost after deleting buffers');
		});
		await expect(repairReactionCounts(client, redis)).rejects.toThrow('connection lost');
		expect(await readCounts()).toEqual(initial);
		expect(buffers.has('reactionsBufferDeltas:target')).toBe(false);
		expect(redis.set).not.toHaveBeenCalled();
		await repairReactionCounts(client, redis);
		expect(await readCounts()).toEqual(actual);
	});

	test('retries previously committed batches if a later batch fails', async () => {
		redis.del.mockResolvedValueOnce(0).mockRejectedValueOnce(new Error('second batch failed'));
		await expect(repairReactionCounts(client, redis, 1)).rejects.toThrow('second batch failed');
		expect(await readCounts('empty')).toEqual({});
		expect(await readCounts()).toEqual(initial);
		expect(redis.set).not.toHaveBeenCalled();
		await repairReactionCounts(client, redis, 1);
		expect(await readCounts()).toEqual(actual);
		expect(redis.set).toHaveBeenCalledOnce();
	});

	test('reconciles actual PostgreSQL rows and prefixed Redis buffers together', async () => {
		const actualRedis = new Redis({ ...config.redisForReactions, keyPrefix: `startup-repair-test:${randomUUID()}:`, lazyConnect: true });
		const marker = 'maintenance:reaction-counts:2026-10-v1';
		try {
			await actualRedis.connect();
			await actualRedis.hset('reactionsBufferDeltas:target', '😍', '3');
			await actualRedis.zadd('reactionsBufferPairs:target', 1, 'user/😍');
			await repairReactionCounts(client, actualRedis);
			expect(await readCounts()).toEqual(actual);
			expect(await actualRedis.exists('reactionsBufferDeltas:target', 'reactionsBufferPairs:target')).toBe(0);
			expect(await actualRedis.get(marker)).toBe('done');
			expect((await repairReactionCounts(client, actualRedis)).skipped).toBe(true);
		} finally {
			await actualRedis.del(marker, 'reactionsBufferDeltas:target', 'reactionsBufferPairs:target');
			actualRedis.disconnect();
		}
	});
});
