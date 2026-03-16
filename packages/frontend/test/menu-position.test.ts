/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import { calculateNestedMenuPosition } from '@/components/MkMenu.position.js';

describe('nested menu positioning', () => {
	test('keeps submenu on the right when there is enough room', () => {
		const position = calculateNestedMenuPosition({
			rootRect: new DOMRect(40, 80, 260, 420),
			parentRect: new DOMRect(60, 120, 220, 56),
			menuRect: new DOMRect(0, 0, 180, 160),
			anchorWidth: 220,
			viewportWidth: 520,
			viewportHeight: 900,
		});

		assert.deepEqual(position, {
			left: 220,
			top: 32,
		});
	});

	test('flips submenu to the left before overlapping the parent menu', () => {
		const position = calculateNestedMenuPosition({
			rootRect: new DOMRect(200, 80, 260, 420),
			parentRect: new DOMRect(220, 120, 220, 56),
			menuRect: new DOMRect(0, 0, 170, 160),
			anchorWidth: 220,
			viewportWidth: 520,
			viewportHeight: 900,
		});

		assert.deepEqual(position, {
			left: -170,
			top: 32,
		});
	});

	test('only overlaps when the flipped submenu would leave the viewport', () => {
		const position = calculateNestedMenuPosition({
			rootRect: new DOMRect(100, 80, 260, 420),
			parentRect: new DOMRect(120, 120, 220, 56),
			menuRect: new DOMRect(0, 0, 170, 160),
			anchorWidth: 220,
			viewportWidth: 520,
			viewportHeight: 900,
		});

		assert.deepEqual(position, {
			left: -84,
			top: 32,
		});
	});
});
