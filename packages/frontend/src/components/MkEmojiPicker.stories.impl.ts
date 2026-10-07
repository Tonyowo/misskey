/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { action } from 'storybook/actions';
import { expect, userEvent, within } from '@storybook/test';
import MkEmojiPicker from './MkEmojiPicker.vue';
import type { StoryObj } from '@storybook/vue3';
import { i18n } from '@/i18n.js';
export const Default = {
	render(args) {
		return {
			components: {
				MkEmojiPicker,
			},
			setup() {
				return {
					args,
				};
			},
			computed: {
				props() {
					return {
						...this.args,
					};
				},
				events() {
					return {
						chosen: action('chosen'),
					};
				},
			},
			template: '<MkEmojiPicker v-bind="props" v-on="events" />',
		};
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		await expect(canvas.queryByRole('searchbox')).not.toBeInTheDocument();
		await userEvent.click(canvas.getByRole('tab', { name: i18n.ts._emojiPicker.categories.face }));
		const grinning = canvasElement.querySelector('[data-emoji="😀"]');
		await expect(grinning).toBeInTheDocument();
		if (grinning == null) throw new Error(); // NOTE: not called
		await userEvent.click(grinning);
		await userEvent.click(canvas.getByRole('tab', { name: i18n.ts.recentUsed }));
		const recentUsedSection = canvas.getByText(new RegExp(i18n.ts.recentUsed)).closest('section');
		await expect(recentUsedSection).toBeInTheDocument();
		if (recentUsedSection == null) throw new Error(); // NOTE: not called
		await expect(within(recentUsedSection).getByAltText('😀')).toBeInTheDocument();
		await expect(within(recentUsedSection).queryByAltText('😬')).toEqual(null);
		await expect(canvas.queryByRole('tab', { name: i18n.ts.pinned })).not.toBeInTheDocument();
		await expect(canvas.queryByRole('button', { name: i18n.ts._emojiPicker.openCategoryMenu })).not.toBeInTheDocument();
		const tabs = canvas.getAllByRole('tab');
		await expect(tabs.filter(tab => tab.tabIndex === 0)).toHaveLength(1);
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkEmojiPicker>;

export const Drawer = {
	...Default,
	args: {
		asDrawer: true,
	},
	play: undefined,
} satisfies StoryObj<typeof MkEmojiPicker>;

export const Window = {
	...Default,
	args: {
		asWindow: true,
	},
	play: undefined,
} satisfies StoryObj<typeof MkEmojiPicker>;
