/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert } from 'vitest';
import { tokenizePostFormCustomEmojis } from '@/utility/post-form-custom-emojis.js';

describe('tokenizePostFormCustomEmojis', () => {
	test('converts a known custom emoji shortcode into an emoji segment', () => {
		const segments = tokenizePostFormCustomEmojis('今天好开心 :miku:', (name) => name === 'miku');

		assert.deepStrictEqual(segments, [
			{ type: 'text', value: '今天好开心 ' },
			{ type: 'customEmoji', name: 'miku', value: ':miku:' },
		]);
	});

	test('keeps incomplete shortcodes as plain text', () => {
		const segments = tokenizePostFormCustomEmojis('今天好开心 :miku', () => true);

		assert.deepStrictEqual(segments, [
			{ type: 'text', value: '今天好开心 :miku' },
		]);
	});

	test('keeps unknown shortcodes as plain text', () => {
		const segments = tokenizePostFormCustomEmojis('今天好开心 :miku:', () => false);

		assert.deepStrictEqual(segments, [
			{ type: 'text', value: '今天好开心 ' },
			{ type: 'text', value: ':miku:' },
		]);
	});

	test('preserves unicode emoji while only replacing matching custom emoji shortcodes', () => {
		const segments = tokenizePostFormCustomEmojis('😀 :miku: 🚀', (name) => name === 'miku');

		assert.deepStrictEqual(segments, [
			{ type: 'text', value: '😀 ' },
			{ type: 'customEmoji', name: 'miku', value: ':miku:' },
			{ type: 'text', value: ' 🚀' },
		]);
	});
});
