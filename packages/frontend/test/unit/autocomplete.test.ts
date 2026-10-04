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
		const completes: Array<(value: unknown) => void> = [];
		const dispose = vi.fn();

		vi.resetModules();
		vi.doMock('@/os.js', () => ({
			popup: vi.fn((_component, _props, events) => {
				completes[0] = events.done;
				return { dispose };
			}),
		}));

		const { Autocomplete } = await import('@/utility/autocomplete.js');
		let selectionStart = '@Tonyo'.length;
		const text = ref<string | number | null>('@Tonyo');
		const inputListeners: EventListener[] = [];
		let selectionRange: { start: number; end: number } | null = null;
		let appliedTextUpdate: { value: string; start: number; end: number | undefined } | null = null;
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
				if (type === 'input') inputListeners[0] = listener;
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
			applyTextUpdate(value: string, start: number, end?: number) {
				appliedTextUpdate = { value, start, end };
			},
			getCaretCoordinates() {
				return { left: 0, top: 0 };
			},
		};

		new Autocomplete(target, text, ['user']);

		assert.exists(inputListeners[0]);
		inputListeners[0](new Event('input'));
		assert.exists(completes[0]);

		selectionStart = 0;
		completes[0]({
			type: 'user',
			value: {
				username: 'Tonyomo',
				host: null,
			},
		});

		assert.deepStrictEqual(appliedTextUpdate, {
			value: '@Tonyomo ',
			start: '@Tonyomo '.length,
			end: '@Tonyomo '.length,
		});
		assert.strictEqual(text.value, '@Tonyo');
		assert.strictEqual(selectionRange, null);

		vi.doUnmock('@/os.js');
	});
});
