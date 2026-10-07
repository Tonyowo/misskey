/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { getMobileNavigationItems } from '@/utility/mobile-navigation.js';

describe('mobile full menu', () => {
	test('makes original feature destinations reachable without changing stored preferences', () => {
		const items = Object.freeze(['explore', 'publish', 'messages', 'profile', '-', 'favorites', 'search', 'chat', 'drive', 'followRequests']);
		const menu = getMobileNavigationItems(items);
		for (const item of ['notifications', 'messages', 'profile', 'favorites', 'search', 'drive', 'followRequests', 'announcements', 'channels', 'clips', 'lists', 'antennas', 'ui']) expect(menu).toContain(item);
		expect(menu).not.toContain('publish');
		expect(menu).not.toContain('chat');
		expect(items).toContain('publish');
	});

	test('does not duplicate custom feature shortcuts', () => {
		const menu = getMobileNavigationItems(['messages', 'channels', '-', 'announcements', 'ui']);
		for (const item of ['channels', 'announcements', 'ui']) expect(menu.filter(x => x === item)).toHaveLength(1);
	});

	test('keeps legacy user menus unchanged', () => {
		const items = ['notifications', 'chat', '-', 'drive'];
		expect(getMobileNavigationItems(items)).toEqual(items);
	});
});
