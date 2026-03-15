/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IncomingHttpHeaders } from 'node:http';
import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { HttpHeader } from 'fastify/types/utils.js';
import { MockMetadata, ModuleMocker } from 'jest-mock';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { SigninApiService } from '@/server/api/SigninApiService.js';
import { RateLimiterService } from '@/server/api/RateLimiterService.js';
import { SigninService } from '@/server/api/SigninService.js';

const moduleMocker = new ModuleMocker(global);

class FakeLimiter {
	public async limit() {
		return;
	}
}

class DummyFastifyReply {
	public statusCode = 200;

	code(num: number): void {
		this.statusCode = num;
	}

	header(_key: HttpHeader, _value: any): void {
	}
}

class DummyFastifyRequest {
	public ip = '0.0.0.0';
	public headers: IncomingHttpHeaders = { accept: 'application/json' };

	constructor(public body: {
		username: string;
		password?: string;
		token?: string;
	}) {
	}
}

type ApiFastifyRequestType = FastifyRequest<{
	Body: {
		username: string;
		password?: string;
		token?: string;
	};
}>;

describe('SigninApiService', () => {
	let app: TestingModule;
	let signinApiService: SigninApiService;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let idService: IdService;
	let signinServiceMock: { signin: ReturnType<typeof jest.fn> };

	async function createUser(data: Partial<MiUser> = {}) {
		const user = await usersRepository.save({
			...data,
		});
		return user;
	}

	async function createUserProfile(data: Partial<MiUserProfile> = {}) {
		const userProfile = await userProfilesRepository.save({
			...data,
		});
		return userProfile;
	}

	beforeAll(async () => {
		signinServiceMock = {
			signin: jest.fn((_request, _reply, user: MiUser) => ({
				finished: true,
				id: user.id,
				i: `${user.id}-token`,
			})),
		};

		app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
			providers: [
				SigninApiService,
				{ provide: RateLimiterService, useClass: FakeLimiter },
				{ provide: SigninService, useValue: signinServiceMock },
			],
		}).useMocker((token) => {
			if (typeof token === 'function') {
				const mockMetadata = moduleMocker.getMetadata(token) as MockMetadata<any, any>;
				const Mock = moduleMocker.generateFromMetadata(mockMetadata);
				return new Mock();
			}
		}).compile();

		signinApiService = app.get<SigninApiService>(SigninApiService);
		usersRepository = app.get<UsersRepository>(DI.usersRepository);
		userProfilesRepository = app.get<UserProfilesRepository>(DI.userProfilesRepository);
		idService = app.get<IdService>(IdService);
	});

	beforeEach(() => {
		signinServiceMock.signin.mockClear();
	});

	afterEach(async () => {
		await usersRepository.createQueryBuilder().delete().execute();
	});

	afterAll(async () => {
		await app.close();
	});

	test('should resolve a verified email address to the local user', async () => {
		const userId = idService.gen();
		await createUser({
			id: userId,
			username: 'alice',
			usernameLower: 'alice',
			host: null,
		});
		await createUserProfile({
			userId,
			email: 'alice@example.com',
			emailVerified: true,
		});

		const req = new DummyFastifyRequest({ username: 'alice@example.com' }) as ApiFastifyRequestType;
		const res = new DummyFastifyReply() as unknown as FastifyReply;
		const response = await signinApiService.signin(req, res);

		expect(res.statusCode).toBe(200);
		expect(response).toEqual({
			finished: false,
			next: 'captcha',
		});
	});

	test('should authenticate with email and password through the existing signin flow', async () => {
		const userId = idService.gen();
		await createUser({
			id: userId,
			username: 'bob',
			usernameLower: 'bob',
			host: null,
		});
		await createUserProfile({
			userId,
			email: 'bob@example.com',
			emailVerified: true,
			password: await bcrypt.hash('correct-horse', 8),
		});

		const req = new DummyFastifyRequest({
			username: 'bob@example.com',
			password: 'correct-horse',
		}) as ApiFastifyRequestType;
		const res = new DummyFastifyReply() as unknown as FastifyReply;
		const response = await signinApiService.signin(req, res);

		expect(signinServiceMock.signin).toHaveBeenCalledTimes(1);
		expect(signinServiceMock.signin.mock.calls[0][2]).toMatchObject({
			id: userId,
			username: 'bob',
		});
		expect(response).toEqual({
			finished: true,
			id: userId,
			i: `${userId}-token`,
		});
	});

	test('should ignore unverified email addresses during signin', async () => {
		const userId = idService.gen();
		await createUser({
			id: userId,
			username: 'carol',
			usernameLower: 'carol',
			host: null,
		});
		await createUserProfile({
			userId,
			email: 'carol@example.com',
			emailVerified: false,
		});

		const req = new DummyFastifyRequest({ username: 'carol@example.com' }) as ApiFastifyRequestType;
		const res = new DummyFastifyReply() as unknown as FastifyReply;
		const response = await signinApiService.signin(req, res);

		expect(res.statusCode).toBe(404);
		expect(response).toEqual({
			error: {
				id: '6cc579cc-885d-43d8-95c2-b8c7fc963280',
			},
		});
	});

	test('should reject unknown email addresses', async () => {
		const req = new DummyFastifyRequest({ username: 'nobody@example.com' }) as ApiFastifyRequestType;
		const res = new DummyFastifyReply() as unknown as FastifyReply;
		const response = await signinApiService.signin(req, res);

		expect(res.statusCode).toBe(404);
		expect(response).toEqual({
			error: {
				id: '6cc579cc-885d-43d8-95c2-b8c7fc963280',
			},
		});
	});
});
