/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { IsNull } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { PasswordResetRequestsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { IdService } from '@/core/IdService.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { EmailService } from '@/core/EmailService.js';
import { createPasswordResetEmail } from '@/core/email/EmailTemplates.js';
import { L_CHARS, secureRndstr } from '@/misc/secure-rndstr.js';

export const meta = {
	tags: ['reset password'],

	requireCredential: false,

	description: 'Request a users password to be reset.',

	limit: {
		duration: ms('1hour'),
		max: 3,
	},

	errors: {

	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		email: { type: 'string' },
	},
	required: ['email'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.passwordResetRequestsRepository)
		private passwordResetRequestsRepository: PasswordResetRequestsRepository,

		private idService: IdService,
		private emailService: EmailService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const emailAddress = ps.email.trim();

			if (emailAddress === '') {
				return;
			}

			const profiles = await this.userProfilesRepository
				.createQueryBuilder('profile')
				.where('LOWER(profile.email) = :email', { email: emailAddress.toLowerCase() })
				.andWhere('profile.emailVerified = true')
				.getMany();

			for (const profile of profiles) {
				const user = await this.usersRepository.findOneBy({
					id: profile.userId,
					host: IsNull(),
				});

				// パスワードリセットの対象はローカルユーザーのみ
				if (user == null) {
					continue;
				}

				const token = secureRndstr(64, { chars: L_CHARS });

				await this.passwordResetRequestsRepository.insert({
					id: this.idService.gen(),
					userId: profile.userId,
					token,
				});

				const link = `${this.config.url}/reset-password/${token}`;
				const email = createPasswordResetEmail(link, user.username);

				this.emailService.sendEmail(emailAddress, email.subject, email.html, email.text);
			}
		});
	}
}
