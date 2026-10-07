/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h } from 'vue';
import ChatHome from '@/pages/chat/home.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useRouter } from '@/router.js';

vi.mock('@/i.js', async () => {
	const { reactive } = await import('vue');
	return { $i: reactive({ policies: { chatAvailability: 'available' } }) };
});
vi.mock('@/router.js', () => {
	const router = { currentRoute: { value: { path: '/my/messages' } }, replace: vi.fn() };
	return { useRouter: () => router };
});
vi.mock('@/events.js', () => ({ useGlobalEvent: vi.fn() }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn().mockResolvedValue({ invitations: 0, myRequests: 0, pendingRequests: 0 }) }));
vi.mock('@/utility/paginator.js', () => ({ Paginator: class { constructor(public endpoint: string, public options: unknown) {} } }));
vi.mock('@/pages/chat/home.home.vue', () => ({ default: { template: '<div data-testid="conversations"/>' } }));
vi.mock('@/pages/chat/home.groups.vue', () => ({ default: { template: '<div data-testid="groups"/>' } }));
vi.mock('@/components/MkNotesTimeline.vue', () => ({ default: { props: ['paginator'], template: '<div data-testid="private-notes" :data-visibility="paginator.options.params.visibility"/>' } }));

const PageHeader = defineComponent({
	props: ['tab', 'tabs', 'actions'], emits: ['update:tab'],
	setup(props, { emit, slots }) {
		return () => h('section', [
			...props.tabs.map((tab: { key: string; title: string }) => h('button', { onClick: () => emit('update:tab', tab.key) }, tab.title)),
			slots.default?.(),
		]);
	},
});
const options = { global: { stubs: { PageWithHeader: PageHeader } } };
afterEach(() => { cleanup(); vi.clearAllMocks(); $i!.policies.chatAvailability = 'available'; });

describe('message destination', () => {
	test('contains conversation, group and legacy private-note functions without social notification categories', async () => {
		const view = render(ChatHome, options);
		expect(view.getByTestId('conversations')).toBeTruthy();
		await fireEvent.click(view.getByRole('button', { name: '群聊' }));
		expect(view.getByTestId('groups')).toBeTruthy();
		expect(useRouter().replace).toHaveBeenCalledWith('/my/messages', { query: { tab: 'groups' } });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.directNotes }));
		expect(view.getByTestId('private-notes').getAttribute('data-visibility')).toBe('specified');
		expect(view.queryByRole('button', { name: i18n.ts._community.likes })).toBeNull();
	});
	test('chat-disabled accounts retain private notes without requesting unavailable chat APIs', () => {
		$i!.policies.chatAvailability = 'unavailable';
		const view = render(ChatHome, options);
		expect(view.getAllByRole('button').map(button => button.textContent)).toEqual([i18n.ts.directNotes]);
		expect(view.getByTestId('private-notes')).toBeTruthy();
		expect(view.queryByTestId('conversations')).toBeNull();
		expect(view.queryByTestId('groups')).toBeNull();
		expect(misskeyApi).not.toHaveBeenCalled();
	});
});
