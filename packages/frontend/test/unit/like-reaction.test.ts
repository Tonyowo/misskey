/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { countLikes, isLikeReaction } from '@/utility/like-reaction.js';

describe('likes using existing reactions', () => {
	test('counts normalized hearts and legacy thumbs only', () => {
		expect(countLikes({ '❤': 2, '❤️': 3, '👍': 4, '😆': 20, ':heart@.': 12 })).toBe(9);
	});
	test('does not treat every active reaction as a like', () => {
		expect(isLikeReaction(null)).toBe(false);
		expect(isLikeReaction('🎉')).toBe(false);
		expect(isLikeReaction('👍')).toBe(true);
		expect(isLikeReaction('❤︎')).toBe(true);
	});
});
