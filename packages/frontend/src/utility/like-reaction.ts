/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function isLikeReaction(reaction: string | null | undefined): boolean {
	const normalized = reaction?.replace(/[\uFE0E\uFE0F]/g, '');
	return normalized === '❤' || normalized === '👍' || normalized === 'like';
}

export function countLikes(reactions: Record<string, number>): number {
	return Object.entries(reactions).reduce((total, [reaction, count]) => total + (isLikeReaction(reaction) ? count : 0), 0);
}
