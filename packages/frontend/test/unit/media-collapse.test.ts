/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { shouldCollapsed } from '@@/js/collapsed.js';
import { note, file } from '../../.storybook/fakes.js';

describe('community media grids', () => {
	test('keeps a short nine-tile gallery visible while retaining long-text collapse', () => {
		const gallery = { ...note(), text: 'short caption', files: Array(18).fill(file()) };
		expect(shouldCollapsed(gallery, [], false)).toBe(false);
		expect(shouldCollapsed({ ...gallery, text: 'x'.repeat(501) }, [], false)).toBe(true);
		expect(shouldCollapsed(gallery, [])).toBe(true);
	});
});
