/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { unref } from 'vue';
import { navbarItemDef } from '@/navbar.js';
import { $i } from '@/i.js';

vi.mock('@/i.js', async () => {
	const { reactive } = await import('vue');
	return { $i: reactive({ username: 'viewer', hasUnreadNotification: false, hasUnreadChatMessages: false, unreadNotificationsCount: 0, policies: { chatAvailability: 'available' } }) };
});
vi.mock('@/os.js', () => ({}));
vi.mock('@/ui/_common_/common.js', () => ({ openInstanceMenu: vi.fn(), openToolsMenu: vi.fn() }));
vi.mock('@/utility/lookup.js', () => ({ lookup: vi.fn() }));
vi.mock('@/utility/clear-cache.js', () => ({ clearCache: vi.fn() }));
vi.mock('@/utility/unison-reload.js', () => ({ unisonReload: vi.fn() }));

beforeEach(() => {
	$i!.hasUnreadNotification = false;
	$i!.hasUnreadChatMessages = false;
	$i!.policies.chatAvailability = 'available';
});

describe('independent inbox navigation indicators', () => {
	test('notifications do not light the conversation shortcut', () => {
		$i!.hasUnreadNotification = true;
		expect(unref(navbarItemDef.notifications.indicated)).toBe(true);
		expect(unref(navbarItemDef.messages.indicated)).toBe(false);
	});
	test('chat messages do not light the notification shortcut', () => {
		$i!.hasUnreadChatMessages = true;
		expect(unref(navbarItemDef.messages.indicated)).toBe(true);
		expect(unref(navbarItemDef.notifications.indicated)).toBe(false);
	});
	test('both conversation shortcuts share a destination while legacy private notes remain available', () => {
		expect(navbarItemDef.messages.to).toBe('/my/messages');
		expect(navbarItemDef.chat.to).toBe(navbarItemDef.messages.to);
		$i!.policies.chatAvailability = 'unavailable';
		expect(unref(navbarItemDef.messages.show)).toBe(true);
		expect(unref(navbarItemDef.chat.show)).toBe(true);
		expect(unref(navbarItemDef.notifications.show)).toBe(true);
	});
});
