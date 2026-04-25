/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test, vi } from 'vitest';
import { ref } from 'vue';
import { searchEmoji } from '@/utility/search-emoji.js';

describe('emoji autocomplete', () => {
	test('名前の完全一致は名前の前方一致より優先される', async () => {
		const result = searchEmoji('foooo', [{ emoji: ':foooo:', name: 'foooo' }, { emoji: ':foooobaaar:', name: 'foooobaaar' }]);
		assert.equal(result[0].emoji, ':foooo:');
	});

	test('名前の前方一致は名前の部分一致より優先される', async () => {
		const result = searchEmoji('baaa', [{ emoji: ':baaar:', name: 'baaar' }, { emoji: ':foooobaaar:', name: 'foooobaaar' }]);
		assert.equal(result[0].emoji, ':baaar:');
	});

	test('名前の完全一致はタグの完全一致より優先される', async () => {
		const result = searchEmoji('foooo', [{ emoji: ':foooo:', name: 'foooo' }, { emoji: ':baaar:', name: 'foooo', aliasOf: 'baaar' }]);
		assert.equal(result[0].emoji, ':foooo:');
	});

	test('名前の前方一致はタグの前方一致より優先される', async () => {
		const result = searchEmoji('foo', [{ emoji: ':foooo:', name: 'foooo' }, { emoji: ':baaar:', name: 'foooo', aliasOf: 'baaar' }]);
		assert.equal(result[0].emoji, ':foooo:');
	});

	test('名前の部分一致はタグの部分一致より優先される', async () => {
		const result = searchEmoji('oooo', [{ emoji: ':foooo:', name: 'foooo' }, { emoji: ':baaar:', name: 'foooo', aliasOf: 'baaar' }]);
		assert.equal(result[0].emoji, ':foooo:');
	});
});

describe('Autocomplete', () => {
	test('uses the opened query range when completing a user mention', async () => {
		let complete: ((value: unknown) => void) | null = null;
		const dispose = vi.fn();

		vi.resetModules();
		vi.doMock('@/os.js', () => ({
			popup: vi.fn((_component, _props, events) => {
				complete = events.done;
				return { dispose };
			}),
		}));

		const { Autocomplete } = await import('@/utility/autocomplete.js');
		let selectionStart = '@Tonyo'.length;
		const text = ref<string | number | null>('@Tonyo');
		let inputListener: EventListener | null = null;
		let selectionRange: { start: number; end: number } | null = null;
		const target = {
			get value() {
				return '@Tonyo';
			},
			get selectionStart() {
				return selectionStart;
			},
			get selectionEnd() {
				return selectionStart;
			},
			scrollLeft: 0,
			scrollTop: 0,
			addEventListener(type: string, listener: EventListener) {
				if (type === 'input') inputListener = listener;
			},
			removeEventListener() {
			},
			getBoundingClientRect() {
				return new DOMRect();
			},
			focus() {
			},
			setSelectionRange(start: number, end: number) {
				selectionRange = { start, end };
			},
			getCaretCoordinates() {
				return { left: 0, top: 0 };
			},
		};

		new Autocomplete(target, text, ['user']);

		assert.exists(inputListener);
		inputListener!(new Event('input'));
		assert.exists(complete);

		selectionStart = 0;
		complete!({
			type: 'user',
			value: {
				username: 'Tonyomo',
				host: null,
			},
		});

		await Promise.resolve();

		assert.strictEqual(text.value, '@Tonyomo ');
		assert.deepStrictEqual(selectionRange, { start: '@Tonyomo '.length, end: '@Tonyomo '.length });

		vi.doUnmock('@/os.js');
	});
});
