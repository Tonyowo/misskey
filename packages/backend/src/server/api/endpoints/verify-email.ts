/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { isAccountEmailUsed, lockAccountEmail, normalizeAccountEmail } from '@/misc/account-email.js';
import { ApiError } from '../error.js';

export const meta = {
	requireCredential: false,

	tags: ['account'],

	errors: {
		unavailable: {
			message: 'This email address is already in use.',
			code: 'EMAIL_ALREADY_USED',
			id: 'bf948754-aac5-4132-9ced-dbb7924646d6',
		},
		noSuchCode: {
			message: 'No such code.',
			code: 'NO_SUCH_CODE',
			id: '97c1f576-e4b8-4b8a-a6dc-9cb65e7f6f85',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		code: { type: 'string' },
	},
	required: ['code'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps) => {
			const profile = await this.userProfilesRepository.findOneBy({
				emailVerifyCode: ps.code,
			});

			if (profile?.email == null) {
				throw new ApiError(meta.errors.noSuchCode);
			}

			const email = normalizeAccountEmail(profile.email);
			await this.userProfilesRepository.manager.transaction(async manager => {
				await lockAccountEmail(manager, email);
				const profiles = manager.getRepository(this.userProfilesRepository.target);
				const current = await profiles.findOne({
					where: { userId: profile.userId, emailVerifyCode: ps.code },
					lock: { mode: 'pessimistic_write' },
				});
				if (current?.email == null || normalizeAccountEmail(current.email) !== email) {
					throw new ApiError(meta.errors.noSuchCode);
				}
				if (await isAccountEmailUsed(profiles, email, profile.userId)) {
					throw new ApiError(meta.errors.unavailable);
				}
				await profiles.update({ userId: profile.userId }, {
					email,
					emailVerified: true,
					emailVerifyCode: null,
				});
			});

			this.globalEventService.publishMainStream(profile.userId, 'meUpdated', await this.userEntityService.pack(profile.userId, { id: profile.userId }, {
				schema: 'MeDetailed',
				includeSecrets: true,
			}));
		});
	}
}
