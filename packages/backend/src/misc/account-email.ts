/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { EntityManager } from 'typeorm';
import type { UserProfilesRepository } from '@/models/_.js';

type EmailProfilesRepository = Pick<UserProfilesRepository, 'createQueryBuilder'>;

export function normalizeAccountEmail(email: string): string {
	return email.trim().toLowerCase();
}

function verifiedEmailQuery(profiles: EmailProfilesRepository, email: string) {
	// Normalize legacy records on read as well as new addresses on write.
	return profiles.createQueryBuilder('profile')
		.where('LOWER(TRIM(profile.email)) = :email', { email: normalizeAccountEmail(email) })
		.andWhere('profile.emailVerified = true');
}

export async function isAccountEmailUsed(profiles: EmailProfilesRepository, email: string, excludeUserId?: string): Promise<boolean> {
	const query = verifiedEmailQuery(profiles, email);
	if (excludeUserId != null) query.andWhere('profile.userId <> :excludeUserId', { excludeUserId });
	return await query.getExists();
}

export async function findVerifiedLocalEmailProfile(profiles: EmailProfilesRepository, email: string) {
	const matches = await verifiedEmailQuery(profiles, email)
		.innerJoinAndSelect('profile.user', 'user')
		.andWhere('user.host IS NULL')
		.take(2)
		.getMany();
	// Never select an arbitrary account from legacy collisions, even for an exact-case match.
	return matches.length === 1 ? matches[0] : null;
}

export async function lockAccountEmail(manager: EntityManager, email: string): Promise<void> {
	await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`account-email:${normalizeAccountEmail(email)}`]);
}
