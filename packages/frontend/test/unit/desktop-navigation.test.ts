/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { getDesktopNavigationItems } from '@/utility/desktop-navigation.js';

describe('desktop community navigation', () => {
	test('separates notification and message shortcuts without changing saved preferences', () => {
		const items = Object.freeze(['explore', 'publish', 'messages', 'profile', '-', 'favorites', 'search', 'chat', 'drive', 'followRequests']);
		expect(getDesktopNavigationItems(items)).toEqual(['explore', 'notifications', 'messages', '-', 'favorites', 'search', 'drive', 'followRequests']);
		expect(items).toContain('publish');
		expect(items).toContain('profile');
		expect(items).toContain('chat');
	});

	test('preserves legacy custom navigation without a unified inbox', () => {
		const items = ['notifications', 'profile', 'publish', '-', 'chat', 'announcements', 'search'];
		expect(getDesktopNavigationItems(items)).toEqual(items);
	});

	test('keeps custom items in order and removes empty sections left by duplicate entries', () => {
		expect(getDesktopNavigationItems(['publish', '-', 'messages', '-', 'profile', '-', 'announcements', '-', 'chat'])).toEqual(['notifications', 'messages', '-', 'announcements']);
	});
});
