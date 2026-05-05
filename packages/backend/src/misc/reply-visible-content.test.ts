/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { extractReplyVisibleContents, renderReplyVisibleContents } from './reply-visible-content.js';

describe('reply-visible-content', () => {
	test('extracts inline reply-visible contents into placeholders', () => {
		const result = extractReplyVisibleContents('public $[replyVisible secret body] tail');

		expect(result.text).toBe('public $[replyVisible.index=0 reply visible] tail');
		expect(result.replyVisibleContents).toStrictEqual([{ text: 'secret body' }]);
	});

	test('renders hidden contents only when reveal is allowed', () => {
		const publicText = 'public $[replyVisible.index=0 reply visible] tail';
		const contents = [{ text: 'secret body' }];

		expect(renderReplyVisibleContents(publicText, contents, false)).toBe(publicText);
		expect(renderReplyVisibleContents(publicText, contents, true)).toBe('public $[replyVisible.revealed=true secret body] tail');
	});

	test('ignores empty reply-visible nodes', () => {
		const result = extractReplyVisibleContents('public $[replyVisible ] tail');

		expect(result.text).toBe('public tail');
		expect(result.replyVisibleContents).toStrictEqual([]);
	});
});
