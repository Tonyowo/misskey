/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	buildCustomEmojiCategoryIndex,
	getEmojiPickerVirtualRange,
	searchEmojiPickerEntries,
} from '@/utility/emoji-picker-data.js';
import {
	RECENTLY_USED_EMOJIS_LIMIT,
	updateRecentlyUsedEmojis,
} from '@/utility/recently-used-emojis.js';

describe('emoji picker category data', () => {
	test('builds the category index in one pass and normalizes uncategorized values', () => {
		const emojis = [
			{ name: 'a', category: 'animals/cats' },
			{ name: 'b', category: null },
			{ name: 'c', category: 'null' },
			{ name: 'd', category: 'animals/cats' },
		];

		const index = buildCustomEmojiCategoryIndex(emojis);

		expect(Array.from(index.keys())).toEqual(['animals/cats', '']);
		expect(index.get('animals/cats')?.map(emoji => emoji.name)).toEqual(['a', 'd']);
		expect(index.get('')?.map(emoji => emoji.name)).toEqual(['b', 'c']);
	});

});

describe('emoji picker search', () => {
	const entries = [
		{ key: ':party_blob:', name: 'party_blob', aliases: ['celebrate'], keywords: [] },
		{ key: ':party:', name: 'party', aliases: [], keywords: ['festival'] },
		{ key: ':blob_party:', name: 'blob_party', aliases: ['party'], keywords: [] },
		{ key: '🎉', name: 'party popper', aliases: [], keywords: ['celebration', 'お祝い'] },
	];

	test('ranks exact name, exact aliases, prefixes, and contains matches', () => {
		expect(searchEmojiPickerEntries(entries, 'party').map(entry => entry.key)).toEqual([
			':party:',
			':blob_party:',
			':party_blob:',
			'🎉',
		]);
	});

	test('supports aliases, localized keywords, colons, and multiple keywords', () => {
		expect(searchEmojiPickerEntries(entries, ':celebrate:').map(entry => entry.key)).toEqual([':party_blob:']);
		expect(searchEmojiPickerEntries(entries, 'お祝い').map(entry => entry.key)).toEqual(['🎉']);
		expect(searchEmojiPickerEntries(entries, 'blob party').map(entry => entry.key)).toEqual([
			':party_blob:',
			':blob_party:',
		]);
	});

	test('returns no results for an empty query and respects the result limit', () => {
		expect(searchEmojiPickerEntries(entries, '')).toEqual([]);
		expect(searchEmojiPickerEntries(entries, 'party', 2)).toHaveLength(2);
	});
});

describe('emoji picker virtual range', () => {
	test('renders visible rows plus two overscan rows on each side', () => {
		expect(getEmojiPickerVirtualRange({
			itemCount: 1000,
			columns: 6,
			rowHeight: 45,
			viewportHeight: 180,
			scrollTop: 450,
		})).toEqual({
			startIndex: 48,
			endIndex: 96,
			startRow: 8,
			endRow: 16,
			totalRows: 167,
			offsetTop: 360,
			totalHeight: 7515,
		});
	});

	test('clamps the virtual range at the start and end', () => {
		const start = getEmojiPickerVirtualRange({
			itemCount: 10,
			columns: 5,
			rowHeight: 40,
			viewportHeight: 80,
			scrollTop: 0,
		});
		const end = getEmojiPickerVirtualRange({
			itemCount: 10,
			columns: 5,
			rowHeight: 40,
			viewportHeight: 80,
			scrollTop: 1000,
		});

		expect(start.startIndex).toBe(0);
		expect(start.endIndex).toBe(10);
		expect(end.startIndex).toBe(0);
		expect(end.endIndex).toBe(10);
	});

	test('handles an empty list', () => {
		expect(getEmojiPickerVirtualRange({
			itemCount: 0,
			columns: 6,
			rowHeight: 45,
			viewportHeight: 180,
			scrollTop: 0,
		}).totalRows).toBe(0);
	});
});

describe('recently used emojis', () => {
	test('deduplicates the selected emoji and keeps the configured storage limit', () => {
		const current = Array.from({ length: RECENTLY_USED_EMOJIS_LIMIT }, (_, index) => `${index}`);
		const updated = updateRecentlyUsedEmojis(current, '10');

		expect(updated).toHaveLength(RECENTLY_USED_EMOJIS_LIMIT);
		expect(updated[0]).toBe('10');
		expect(updated.filter(emoji => emoji === '10')).toHaveLength(1);
	});
});
