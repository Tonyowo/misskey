/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { DataSource, EntitySchema } from 'typeorm';
import type * as Redis from 'ioredis';
import { loadConfig } from '@/config.js';
import { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import type { NotesRepository } from '@/models/_.js';

describe('ReactionsBufferingService', () => {
	const config = loadConfig();
	const schema = new EntitySchema<{
		id: string;
		reactions: Record<string, number>;
		reactionAndUserPairCache: string[];
	}>({
		name: 'buffered_reactions_test',
		columns: {
			id: { type: String, primary: true },
			reactions: { type: 'jsonb' },
			reactionAndUserPairCache: { type: String, array: true },
		},
	});
	const db = new DataSource({
		type: 'postgres',
		host: config.db.host,
		port: config.db.port,
		username: config.db.user,
		password: config.db.pass,
		database: config.db.db,
		entities: [schema],
	});
	const runner = db.createQueryRunner();
	const pipeline = { del: vi.fn(), exec: vi.fn().mockResolvedValue([]) };
	const redis = {
		scan: vi.fn().mockImplementation(async () => ['0', [`${config.redis.prefix}:reactionsBufferDeltas:note`]]),
		pipeline: () => pipeline,
	} as unknown as Redis.Redis;
	const subscriber = { on: vi.fn(), off: vi.fn() } as unknown as Redis.Redis;
	const repository = { createQueryBuilder: () => runner.manager.getRepository(schema).createQueryBuilder() } as unknown as NotesRepository;
	const service = new ReactionsBufferingService(config, subscriber, redis, repository);

	beforeAll(async () => {
		await db.initialize();
		await runner.connect();
		await runner.query('CREATE TEMPORARY TABLE buffered_reactions_test (id text PRIMARY KEY, reactions jsonb NOT NULL, "reactionAndUserPairCache" text[] NOT NULL)');
	});

	afterAll(async () => {
		service.dispose();
		await runner.release();
		if (db.isInitialized) await db.destroy();
	});

	test('persists every buffered delta without overwriting other emoji counts', async () => {
		await runner.manager.getRepository(schema).save({
			id: 'note',
			reactions: { '😍': 5, ':dacall:': 3, '😀': 2, '🤙': 1, '❤': 7 },
			reactionAndUserPairCache: [],
		});
		vi.spyOn(service, 'getMany').mockResolvedValue(new Map([['note', {
			deltas: { '😍': 5, ':dacall:': 1, '😀': -1, '🤙': 2, '🎉': 1 },
			pairs: [['user', '🤙']],
		}]]));

		await service.bake();

		const note = await runner.manager.getRepository(schema).findOneByOrFail({ id: 'note' });
		expect(note.reactions).toEqual({ '😍': 10, ':dacall:': 4, '😀': 1, '🤙': 3, '❤': 7, '🎉': 1 });
		expect(note.reactionAndUserPairCache).toEqual(['user/🤙']);
	});

	test('waits for the database write and propagates write failures', async () => {
		vi.spyOn(service, 'getMany').mockResolvedValue(new Map([['note', { deltas: { '😍': 1 }, pairs: [] }]]));
		let rejectWrite!: (error: Error) => void;
		const execute = vi.fn(() => new Promise((_, reject) => { rejectWrite = reject; }));
		const builder = { update: vi.fn(), set: vi.fn(), where: vi.fn(), setParameters: vi.fn(), execute };
		for (const method of [builder.update, builder.set, builder.where, builder.setParameters]) method.mockReturnValue(builder);
		vi.spyOn(repository, 'createQueryBuilder').mockReturnValue(builder as never);
		let finished = false;
		const baking = service.bake().finally(() => { finished = true; });
		const failure = new Error('database unavailable');
		const assertion = expect(baking).rejects.toThrow(failure);
		await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
		expect(finished).toBe(false);
		rejectWrite(failure);
		await assertion;
	});
});
