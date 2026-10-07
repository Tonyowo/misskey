/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import type { entities } from 'misskey-js';
import { note as fakeNote } from '../../.storybook/fakes.js';
import MkCommentThread from '@/components/MkCommentThread.vue';
import MkNote from '@/components/MkNote.vue';
import { i18n } from '@/i18n.js';
import type { UseNoteProps, UseNoteElements, UseNoteOptions } from '@/composables/use-note.js';

const { actions, states, handlers, api, push } = vi.hoisted(() => ({
	actions: { reply: vi.fn(), renote: vi.fn(), toggleReact: vi.fn(), showMenu: vi.fn() },
	states: new Map<string, any>(),
	handlers: new Map<string, (payload: any) => void>(),
	api: vi.fn(),
	push: vi.fn(),
}));

vi.mock('@/composables/use-note.js', async () => {
	const { ref } = await import('vue');
	return { useNote: (props: UseNoteProps, _elements: UseNoteElements, options: UseNoteOptions) => {
		const state = {
			note: props.note,
			appearNote: props.note,
			$appearNote: props.note,
			muted: ref(false),
			isDeleted: ref(false),
			renoteCollapsed: ref(false),
			collapsed: ref(false),
			parsed: [],
			urls: [],
			canRenote: true,
			...actions,
		};
		states.set(props.note.id, { ...state, options });
		return state;
	} };
});
vi.mock('@/router.js', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api }));
vi.mock('@/events.js', () => ({ useGlobalEvent: (name: string, handler: (payload: any) => void) => handlers.set(name, handler) }));
vi.mock('@/components/MkNoteHeader.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/MkNoteSub.vue', () => ({ default: { template: '<div data-testid="parent-preview" />' } }));
vi.mock('@/components/MkNoteSimple.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/MkReactionsViewer.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/MkMediaList.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/MkCwButton.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/MkPoll.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/MkUrlPreview.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/MkInstanceTicker.vue', () => ({ default: { template: '<div />' } }));

const options = { global: {
	stubs: {
		MkAvatar: true,
		MkA: { template: '<a><slot /></a>' },
		Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
		MkButton: { template: '<button><slot /></button>' },
		MkInfo: true,
		MkError: true,
		MkLoading: true,
	},
	directives: { hotkey: {} },
} };

const comment = () => ({ ...fakeNote(), id: 'comment', text: 'comment body', cw: null, files: [], replyId: 'parent', repliesCount: 1, renoteId: null, poll: null });
const response = (items: entities.Note[] = []) => ({ items, hasMore: false, truncated: false, nextCursor: null });

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	states.clear();
	handlers.clear();
});

describe('comment actions', () => {
	test('renders the original reply arrow and working icon actions without a repeated parent preview', async () => {
		const view = render(MkNote, { ...options, props: { note: comment(), compact: true } });
		const reply = view.getByRole('button', { name: i18n.ts.reply });
		expect(reply.querySelector('.ti-arrow-back-up')).not.toBeNull();
		expect(reply.textContent?.trim()).toBe('1');
		expect(view.queryByTestId('parent-preview')).toBeNull();
		expect(states.get('comment').options.forceCapture).toBe(true);

		await fireEvent.click(reply);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._community.reposts }));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.reactions }));
		await fireEvent.mouseDown(view.getByRole('button', { name: i18n.ts.more }));
		for (const action of Object.values(actions)) expect(action).toHaveBeenCalledOnce();
		expect(push).not.toHaveBeenCalled();

		states.get('comment').isDeleted.value = true;
		await nextTick();
		expect(view.queryByText('comment body')).toBeNull();
	});

	test('keeps timeline labels and parent previews outside compact comments', () => {
		const view = render(MkNote, { ...options, props: { note: comment() } });
		expect(view.getByText(i18n.ts._community.comment)).toBeTruthy();
		expect(view.getByText(i18n.ts._community.reposts)).toBeTruthy();
		expect(view.getByTestId('parent-preview')).toBeTruthy();
	});

	test('gives loaded replies the same actions and refreshes after a nested reply is posted', async () => {
		api.mockResolvedValueOnce(response([{ ...comment(), id: 'child', replyId: 'comment', text: 'child body' }]))
			.mockResolvedValueOnce(response([{ ...comment(), id: 'new-child', replyId: 'child', text: 'new reply' }]));
		const view = render(MkCommentThread, { ...options, props: { note: comment() } });
		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.loadReplies} (1)` }));
		await waitFor(() => expect(view.queryByText('child body')).not.toBeNull());
		expect(view.getAllByRole('button', { name: i18n.ts.reply })).toHaveLength(2);
		expect(states.get('child').options.forceCapture).toBe(true);
		handlers.get('notePosted')!({ replyId: 'child' });
		await waitFor(() => expect(view.queryByText('new reply')).not.toBeNull());
		expect(api).toHaveBeenLastCalledWith('notes/replies-thread', { noteId: 'comment', untilId: undefined, limit: 20 });
		expect(view.queryByText('child body')).toBeNull();
	});

	test('does not lose a refresh when a reply is posted during loading', async () => {
		let complete!: (value: ReturnType<typeof response>) => void;
		api.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }))
			.mockResolvedValueOnce(response([{ ...comment(), id: 'new-child', text: 'new reply' }]));
		const view = render(MkCommentThread, { ...options, props: { note: comment() } });
		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.loadReplies} (1)` }));
		handlers.get('notePosted')!({ replyId: 'comment' });
		complete(response());
		await waitFor(() => expect(view.queryByText('new reply')).not.toBeNull());
		expect(api).toHaveBeenCalledTimes(2);
	});

	test('remembers loaded child IDs while refreshing the thread', async () => {
		let complete!: (value: ReturnType<typeof response>) => void;
		api.mockResolvedValueOnce(response([{ ...comment(), id: 'child', text: 'child body' }]))
			.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }))
			.mockResolvedValueOnce(response([{ ...comment(), id: 'nested', replyId: 'child', text: 'nested reply' }]));
		const view = render(MkCommentThread, { ...options, props: { note: comment() } });
		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.loadReplies} (1)` }));
		await waitFor(() => expect(view.queryByText('child body')).not.toBeNull());
		handlers.get('notePosted')!({ replyId: 'comment' });
		handlers.get('notePosted')!({ replyId: 'child' });
		complete(response());
		await waitFor(() => expect(view.queryByText('nested reply')).not.toBeNull());
		expect(api).toHaveBeenCalledTimes(3);
	});
});
