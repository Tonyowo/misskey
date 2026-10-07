/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h } from 'vue';
import { notificationTypes } from 'misskey-js';
import Notifications from '@/pages/notifications.vue';
import Messages from '@/pages/messages.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

vi.mock('@/os.js', () => ({ apiWithDialog: vi.fn().mockResolvedValue(undefined), popupMenu: vi.fn() }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/utility/paginator.js', () => ({ Paginator: class {} }));
vi.mock('@/components/MkStreamingNotificationsTimeline.vue', () => ({ default: { props: ['excludeTypes'], template: '<div data-testid="notification-stream" :data-excluded="JSON.stringify(excludeTypes)"/>' } }));
vi.mock('@/components/MkNotesTimeline.vue', () => ({ default: { template: '<div data-testid="notes-timeline"/>' } }));
vi.mock('@/pages/chat/home.vue', () => ({ default: { props: ['tab', 'filter', 'q', 'focus'], template: '<div data-testid="chat-home" :data-focus="focus"/>' } }));

const PageHeader = defineComponent({
	props: ['tab', 'tabs', 'actions'],
	emits: ['update:tab'],
	setup(props, { emit, slots }) {
		return () => h('section', [
			...props.tabs.map((tab: { key: string; title: string }) => h('button', { onClick: () => emit('update:tab', tab.key) }, tab.title)),
			...props.actions.map((action: { text: string; handler: () => void }) => h('button', { onClick: action.handler }, action.text)),
			slots.default?.(),
		]);
	},
});
const options = { global: { stubs: { PageWithHeader: PageHeader } } };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('notification and message page boundaries', () => {
	test.each([
		['comments', ['reply']],
		['likes', ['reaction']],
		['reposts', ['renote', 'quote']],
	] as const)('keeps the %s category in notifications', async (category, expected) => {
		const view = render(Notifications, options);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._community[category] }));
		const excluded = JSON.parse(view.getByTestId('notification-stream').getAttribute('data-excluded')!);
		expect(notificationTypes.filter(type => !excluded.includes(type))).toEqual(expected);
	});
	test('mentions use the notification stream so its existing visibility-based read handling applies', () => {
		const view = render(Notifications, { ...options, props: { initialTab: 'mentions' } });
		const excluded = JSON.parse(view.getByTestId('notification-stream').getAttribute('data-excluded')!);
		expect(notificationTypes.filter(type => !excluded.includes(type))).toEqual(['mention']);
		expect(view.queryByTestId('notes-timeline')).toBeNull();
	});
	test('system excludes social interaction categories and preserves other reminder types', () => {
		const view = render(Notifications, { ...options, props: { initialTab: 'system' } });
		const excluded = JSON.parse(view.getByTestId('notification-stream').getAttribute('data-excluded')!);
		for (const type of ['reply', 'mention', 'reaction', 'renote', 'quote']) expect(excluded).toContain(type);
		expect(excluded).not.toContain('app');
	});
	test('marking notifications read calls only the notification API', async () => {
		const view = render(Notifications, options);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.markAllAsRead }));
		expect(os.apiWithDialog).toHaveBeenCalledExactlyOnceWith('notifications/mark-all-as-read', {});
		expect(view.queryByTestId('chat-home')).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts.directNotes })).toBeNull();
	});
	test('preserves the old directNotes URL', () => {
		const view = render(Notifications, { ...options, props: { initialTab: 'directNotes' } });
		expect(view.getByTestId('notes-timeline')).toBeTruthy();
		expect(view.queryByTestId('notification-stream')).toBeNull();
	});
	test('the previous messages URL now hosts conversations and group management only', () => {
		const view = render(Messages, { props: { tab: 'groups', focus: 'approvals' } });
		expect(view.getByTestId('chat-home').getAttribute('data-focus')).toBe('approvals');
		expect(view.queryByTestId('notification-stream')).toBeNull();
	});
});
