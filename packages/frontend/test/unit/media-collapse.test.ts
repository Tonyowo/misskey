/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { shouldCollapsed } from '@@/js/collapsed.js';
import { note, file } from '../../.storybook/fakes.js';
import MkSubNoteContent from '@/components/MkSubNoteContent.vue';
import { i18n } from '@/i18n.js';

vi.mock('@/components/MkMediaList.vue', () => ({ default: { template: '<div></div>' } }));
vi.mock('@/components/MkPoll.vue', () => ({ default: { template: '<div></div>' } }));

afterEach(cleanup);

const options = {
	global: { stubs: { Mfm: { props: ['text'], template: '<span>{{ text }}</span>' } } },
};

describe('community media grids', () => {
	test('keeps a short nine-tile gallery visible while retaining long-text collapse', () => {
		const gallery = { ...note(), text: 'short caption', files: Array(18).fill(file()) };
		expect(shouldCollapsed(gallery, [], false)).toBe(false);
		expect(shouldCollapsed({ ...gallery, text: 'x'.repeat(501) }, [], false)).toBe(true);
		expect(shouldCollapsed(gallery, [])).toBe(true);
	});

	test('keeps a short reply preview readable when attachments already have a details summary', () => {
		const preview = { ...note(), text: 'short caption', files: Array(15).fill(file()) };
		const view = render(MkSubNoteContent, { ...options, props: { note: preview } });
		expect(view.getByText(preview.text)).toBeTruthy();
		expect(view.container.querySelector('summary')?.textContent).toContain(i18n.tsx.withNFiles({ n: 15 }));
		expect(view.queryByRole('button', { name: i18n.ts.showMore })).toBeNull();
	});

	test('still allows expanding and collapsing long reply previews', async () => {
		const preview = { ...note(), text: 'long caption '.repeat(50), files: Array(15).fill(file()) };
		const view = render(MkSubNoteContent, { ...options, props: { note: preview } });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.showMore }));
		expect(view.queryByRole('button', { name: i18n.ts.showMore })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.showLess }));
		expect(view.getByRole('button', { name: i18n.ts.showMore })).toBeTruthy();
	});
});
