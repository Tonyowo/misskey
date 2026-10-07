/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import { preferState } from '../setup.unit.js';
import MobileFooterMenu from '@/ui/_common_/mobile-footer-menu.vue';
import { mainRouter } from '@/router.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { $i } from '@/i.js';

vi.mock('@/router.js', async () => {
	const { shallowRef } = await import('vue');
	return { mainRouter: { currentRoute: shallowRef({ path: '/' }), push: vi.fn() } };
});
vi.mock('@/os.js', () => ({ post: vi.fn() }));
vi.mock('@/navbar.js', async () => {
	const { reactive, computed } = await import('vue');
	const { $i } = await import('@/i.js');
	return { navbarItemDef: reactive({
		messages: { indicated: computed(() => $i!.hasUnreadChatMessages) },
		chat: { indicated: computed(() => $i!.hasUnreadChatMessages) },
	}) };
});
vi.mock('@/i.js', async () => {
	const { reactive } = await import('vue');
	return { $i: reactive({ hasUnreadNotification: true, unreadNotificationsCount: 123, hasUnreadChatMessages: true }) };
});

const options = { global: { directives: { tooltip: {} } } };
afterEach(() => {
	cleanup(); vi.clearAllMocks(); delete preferState.menu;
	$i!.hasUnreadNotification = true;
	$i!.hasUnreadChatMessages = true;
});

describe('mobile icon navigation', () => {
	test('keeps buttons named for accessibility while hiding visible labels and opening the full menu', async () => {
		preferState.menu = ['messages'];
		const view = render(MobileFooterMenu, { ...options, props: { drawerMenuShowing: false } });
		expect(view.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
			i18n.ts.menu, i18n.ts._community.home, i18n.ts.notifications, i18n.ts.widgets, i18n.ts.note,
		]);
		for (const button of view.getAllByRole('button')) expect(button.textContent?.trim()).toBe(button.getAttribute('aria-label') === i18n.ts.notifications ? '99+' : '');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.menu }));
		expect(view.emitted('update:drawerMenuShowing')[0]).toEqual([true]);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.widgets }));
		expect(view.emitted('update:widgetsShowing')[0]).toEqual([true]);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.notifications }));
		expect(mainRouter.push).toHaveBeenCalledWith('/my/notifications');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.note }));
		expect(os.post).toHaveBeenCalledOnce();
	});

	test('tracks the current destination rather than showing a static selected icon', async () => {
		preferState.menu = ['messages'];
		mainRouter.currentRoute.value = { path: '/', component: {} };
		const view = render(MobileFooterMenu, options);
		expect(view.getByRole('button', { name: i18n.ts._community.home }).getAttribute('aria-current')).toBe('page');
		mainRouter.currentRoute.value = { path: '/my/notifications', component: {} };
		await nextTick();
		expect(view.getByRole('button', { name: i18n.ts._community.home }).hasAttribute('aria-current')).toBe(false);
		expect(view.getByRole('button', { name: i18n.ts.notifications }).getAttribute('aria-current')).toBe('page');
		mainRouter.currentRoute.value = { path: '/chat', component: {} };
		await nextTick();
		expect(view.getByRole('button', { name: i18n.ts.notifications }).hasAttribute('aria-current')).toBe(false);
	});

	test('separates notification counts from unread chat menu indicators', async () => {
		preferState.menu = ['messages'];
		$i!.hasUnreadChatMessages = false;
		const view = render(MobileFooterMenu, options);
		expect(view.getByRole('button', { name: i18n.ts.notifications }).textContent?.trim()).toBe('99+');
		expect(view.getByRole('button', { name: i18n.ts.menu }).querySelector('._indicatorCircle')).toBeNull();
		$i!.hasUnreadNotification = false;
		$i!.hasUnreadChatMessages = true;
		await nextTick();
		expect(view.getByRole('button', { name: i18n.ts.notifications }).textContent?.trim()).toBe('');
		expect(view.getByRole('button', { name: i18n.ts.menu }).querySelector('._indicatorCircle')).not.toBeNull();
	});
});
