/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import type { entities } from 'misskey-js';
import { note as fakeNote } from '../../.storybook/fakes.js';
import MkNoteSimple from '@/components/MkNoteSimple.vue';

const { handlers, subscribe } = vi.hoisted(() => ({ handlers: new Map<string, (payload: any) => void>(), subscribe: vi.fn() }));
vi.mock('@/composables/use-note-capture.js', () => ({ useNoteCapture: () => ({ subscribe }) }));
vi.mock('@/events.js', () => ({ useGlobalEvent: (name: string, callback: (payload: any) => void) => handlers.set(name, callback) }));
vi.mock('@/components/MkNoteHeader.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/MkSubNoteContent.vue', () => ({ default: { props: ['note'], template: '<div>{{ note.text }}</div>' } }));

const options = { global: { stubs: { MkAvatar: true } } };
afterEach(() => { cleanup(); handlers.clear(); subscribe.mockClear(); });

describe('live comments and historical snapshots', () => {
	test('removes previously unlocked content on a permission update and removes deleted comments', async () => {
		const original = { ...fakeNote(), text: 'unlocked secret', cw: null, hasReplyVisibleContent: true };
		const view = render(MkNoteSimple, { ...options, props: { note: original, live: true } });
		expect(subscribe).toHaveBeenCalledOnce();
		expect(view.queryByText('unlocked secret')).not.toBeNull();
		handlers.get('noteUpdated')!({ ...original, text: 'public only' } satisfies entities.Note);
		await nextTick();
		expect(view.queryByText('unlocked secret')).toBeNull();
		expect(view.queryByText('public only')).not.toBeNull();
		handlers.get('noteDeleted')!(original.id);
		await nextTick();
		expect(view.queryByText('public only')).toBeNull();
	});
	test('keeps historical snapshots immutable without a live subscription', () => {
		const original = { ...fakeNote(), text: 'historical version', cw: null };
		const view = render(MkNoteSimple, { ...options, props: { note: original } });
		expect(subscribe).not.toHaveBeenCalled();
		expect(handlers.size).toBe(0);
		expect(view.queryByText('historical version')).not.toBeNull();
	});
});
