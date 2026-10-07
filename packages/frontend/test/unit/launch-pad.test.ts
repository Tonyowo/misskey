/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, nextTick, ref } from 'vue';
import { preferReactive } from '../setup.unit.js';
import LaunchPad from '@/components/MkLaunchPad.vue';

vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/components/MkModal.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ setup(_props, { slots, expose }) {
		expose({ close: vi.fn() });
		return () => h('section', slots.default?.({ type: 'popup', maxHeight: 600 }));
	} }) };
});
vi.mock('@/navbar.js', async () => {
	const { computed } = await import('vue');
	return { navbarItemDef: {
		messages: { title: 'Messages', icon: 'ti ti-messages', to: '/chat' },
		notifications: { title: 'Notifications', icon: 'ti ti-bell', to: '/my/notifications' },
		chat: { title: 'Chat alias', icon: 'ti ti-messages', to: '/chat' },
		announcements: { title: 'Announcements', icon: 'ti ti-speakerphone', to: '/announcements' },
		channels: { title: 'Channels', icon: 'ti ti-device-tv', to: '/channels' },
		pages: { title: 'Pages', icon: 'ti ti-file', to: '/pages' },
		gallery: { title: 'Gallery', icon: 'ti ti-photo', to: '/gallery' },
		hidden: { title: 'Unavailable', icon: 'ti ti-lock', to: '/hidden', show: computed(() => false) },
	} };
});

const options = { global: {
	directives: { 'click-anime': {} },
	stubs: { MkA: defineComponent({ props: ['to'], template: '<a :href="to"><slot/></a>' }) },
} };
afterEach(() => { cleanup(); delete preferReactive.menu; });

describe('navigation overflow launcher', () => {
	test('provides omitted community features without repeating pinned destinations', () => {
		preferReactive.menu = ref(['messages']);
		const view = render(LaunchPad, options);
		expect(view.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(['/announcements', '/channels', '/pages', '/gallery']);
		expect(view.queryByText('Messages')).toBeNull();
		expect(view.queryByText('Notifications')).toBeNull();
		expect(view.queryByText('Chat alias')).toBeNull();
	});
	test('also provides the fallback for legacy custom menus', () => {
		preferReactive.menu = ref(['announcements']);
		const view = render(LaunchPad, options);
		expect(view.getByRole('link', { name: 'Channels' }).getAttribute('href')).toBe('/channels');
		expect(view.getByRole('link', { name: 'Messages' })).toBeTruthy();
		expect(view.queryByText('Announcements')).toBeNull();
	});
	test('honors visibility conditions and responds to menu changes while open', async () => {
		preferReactive.menu = ref(['messages']);
		const view = render(LaunchPad, options);
		expect(view.queryByText('Unavailable')).toBeNull();
		preferReactive.menu.value = ['messages', 'channels'];
		await nextTick();
		expect(view.queryByText('Channels')).toBeNull();
		expect(view.getByRole('link', { name: 'Gallery' })).toBeTruthy();
	});
});
