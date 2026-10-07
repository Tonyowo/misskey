/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import pg from 'pg';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '@/config.js';
import { reconcileUserNoteCounts, repairUserNoteCounts } from '@/boot/user-note-count-repair.js';

describe('local profile note count reconciliation', () => {
	const config = loadConfig();
	const connection = { host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.pass, database: config.db.db };
	const client = new pg.Client(connection);
	const state = new Map<string, string>();
	const redis = {
		get: vi.fn(async (key: string) => state.get(key) ?? null),
		set: vi.fn(async (key: string, value: string) => { state.set(key, value); return 'OK'; }),
	};
	const readCount = async (id: string) => (await client.query('SELECT "notesCount" FROM "user" WHERE id = $1', [id])).rows[0].notesCount;

	beforeAll(async () => {
		await client.connect();
		await client.query('CREATE TEMPORARY TABLE "user" (id varchar PRIMARY KEY, host varchar, "notesCount" integer NOT NULL, "updatedAt" timestamptz DEFAULT \'2000-01-01\')');
		await client.query('CREATE TEMPORARY TABLE note (id varchar PRIMARY KEY, "userId" varchar NOT NULL, visibility varchar, "replyId" varchar, "renoteId" varchar, "channelId" varchar)');
	});
	beforeEach(async () => {
		await client.query('TRUNCATE "user", note');
		await client.query(`INSERT INTO "user" (id, host, "notesCount") VALUES
			('a-over', NULL, 4), ('b-under', NULL, 1), ('c-empty', NULL, 9), ('d-correct', NULL, 2), ('e-zero', NULL, 0), ('remote', 'remote.example', 99)`);
		await client.query(`INSERT INTO note VALUES
			('a1', 'a-over', 'public', 'parent1', NULL, NULL),
			('a2', 'a-over', 'public', 'parent2', NULL, NULL),
			('a3', 'a-over', 'public', 'parent3', NULL, NULL),
			('b1', 'b-under', 'home', NULL, NULL, NULL),
			('b2', 'b-under', 'followers', NULL, NULL, NULL),
			('b3', 'b-under', 'specified', NULL, 'quoted', NULL),
			('b4', 'b-under', 'public', NULL, NULL, 'channel'),
			('d1', 'd-correct', 'public', NULL, NULL, NULL),
			('d2', 'd-correct', 'public', NULL, 'renoted', NULL),
			('r1', 'remote', 'public', NULL, NULL, NULL)`);
		state.clear();
		vi.clearAllMocks();
	});
	afterAll(async () => { await client.end(); });

	test('audits every local account without changing counters or Redis', async () => {
		expect(await reconcileUserNoteCounts(client, { batchSize: 1 })).toEqual({ checked: 5, mismatched: 3, repaired: 0 });
		expect(await readCount('a-over')).toBe(4);
		expect(await readCount('c-empty')).toBe(9);
		expect(redis.set).not.toHaveBeenCalled();
	});

	test('repairs overcounts, undercounts and empty accounts, includes all note types and preserves remote counters and timestamps', async () => {
		expect(await reconcileUserNoteCounts(client, { apply: true, batchSize: 1 })).toEqual({ checked: 5, mismatched: 3, repaired: 3 });
		for (const [id, count] of [['a-over', 3], ['b-under', 4], ['c-empty', 0], ['d-correct', 2], ['e-zero', 0], ['remote', 99]] as const) {
			expect(await readCount(id)).toBe(count);
		}
		expect((await client.query('SELECT count(*)::int AS count FROM "user" WHERE "updatedAt" != \'2000-01-01\'')).rows[0].count).toBe(0);
		expect((await client.query('SELECT count(*)::int AS count FROM note')).rows[0].count).toBe(10);
		expect(await reconcileUserNoteCounts(client, { apply: true })).toEqual({ checked: 5, mismatched: 0, repaired: 0 });
	});

	test('rolls back all batches when a later counter cannot be updated', async () => {
		await client.query('ALTER TABLE "user" ADD CONSTRAINT test_repair_failure CHECK (id != \'b-under\' OR "notesCount" < 4)');
		try {
			await expect(reconcileUserNoteCounts(client, { apply: true, batchSize: 1 })).rejects.toThrow();
			expect(await readCount('a-over')).toBe(4);
			expect(await readCount('b-under')).toBe(1);
		} finally {
			await client.query('ALTER TABLE "user" DROP CONSTRAINT test_repair_failure');
		}
	});

	test('writes a completion marker after repair and skips subsequent starts', async () => {
		expect(await repairUserNoteCounts(client, redis)).toEqual({ skipped: false, checked: 5, mismatched: 3, repaired: 3 });
		expect(await repairUserNoteCounts(client, redis)).toEqual({ skipped: true, checked: 0, mismatched: 0, repaired: 0 });
		expect(redis.set).toHaveBeenCalledOnce();
	});

	test('retries safely if the Redis marker could not be written after committing the repair', async () => {
		redis.set.mockRejectedValueOnce(new Error('Redis unavailable'));
		await expect(repairUserNoteCounts(client, redis)).rejects.toThrow('Redis unavailable');
		expect(state.size).toBe(0);
		expect(await readCount('a-over')).toBe(3);
		expect((await repairUserNoteCounts(client, redis)).repaired).toBe(0);
	});

	test('serializes new master starts until the completion marker is available', async () => {
		const secondClient = new pg.Client(connection);
		await secondClient.connect();
		const { rows: [{ pid }] } = await secondClient.query('SELECT pg_backend_pid() AS pid');
		let resume!: () => void;
		redis.set.mockImplementationOnce((key, value) => new Promise(resolve => {
			resume = () => { state.set(key, value); resolve('OK'); };
		}));
		try {
			const first = repairUserNoteCounts(client, redis);
			await vi.waitFor(() => expect(redis.set).toHaveBeenCalled());
			const second = repairUserNoteCounts(secondClient, redis);
			await vi.waitFor(async () => {
				const { rows } = await client.query('SELECT wait_event FROM pg_stat_activity WHERE pid = $1', [pid]);
				expect(rows[0].wait_event).toBe('advisory');
			});
			resume();
			expect((await first).repaired).toBe(3);
			// No temporary tables exist on the second connection; skipping proves ordering.
			expect((await second).skipped).toBe(true);
		} finally {
			await secondClient.end();
		}
	});

	test('uses the configured Redis prefix for the persistent completion marker', async () => {
		const actualRedis = new Redis({ ...config.redis, keyPrefix: `user-note-count-test:${randomUUID()}:`, lazyConnect: true });
		const marker = 'maintenance:user-note-counts:2026-10-v1';
		try {
			await actualRedis.connect();
			expect((await repairUserNoteCounts(client, actualRedis)).repaired).toBe(3);
			expect(await actualRedis.get(marker)).toBe('done');
			expect(await actualRedis.ttl(marker)).toBe(-1);
			expect((await repairUserNoteCounts(client, actualRedis)).skipped).toBe(true);
		} finally {
			await actualRedis.del(marker);
			actualRedis.disconnect();
		}
	});

	test('handles an empty local population and rejects invalid batch sizes', async () => {
		await client.query('DELETE FROM "user" WHERE host IS NULL');
		expect(await reconcileUserNoteCounts(client, { apply: true })).toEqual({ checked: 0, mismatched: 0, repaired: 0 });
		await expect(reconcileUserNoteCounts(client, { batchSize: 0 })).rejects.toThrow('Invalid');
	});
});
