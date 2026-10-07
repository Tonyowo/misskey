/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const RECENTLY_USED_EMOJIS_LIMIT = 30;

export function updateRecentlyUsedEmojis(recentlyUsedEmojis: readonly string[], emoji: string): string[] {
	return [
		emoji,
		...recentlyUsedEmojis.filter((recentlyUsedEmoji) => recentlyUsedEmoji !== emoji),
	].slice(0, RECENTLY_USED_EMOJIS_LIMIT);
}
