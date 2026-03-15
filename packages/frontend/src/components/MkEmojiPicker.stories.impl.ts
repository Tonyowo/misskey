/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { action } from 'storybook/actions';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import type { StoryObj } from '@storybook/vue3';
import { i18n } from '@/i18n.js';
import MkEmojiPicker from './MkEmojiPicker.vue';
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
		let faceCategory = canvas.queryByRole('button', { name: /face/i });
		let guard = 0;
		while (faceCategory == null && guard < 8) {
			const nextButton = canvas.queryByRole('button', { name: i18n.ts.next });
			if (nextButton == null) break;
			await waitFor(() => userEvent.click(nextButton));
			faceCategory = canvas.queryByRole('button', { name: /face/i });
			guard += 1;
		}
		await expect(faceCategory).toBeInTheDocument();
		if (faceCategory == null) throw new Error(); // NOTE: not called
		await waitFor(() => userEvent.click(faceCategory));
		const grinning = canvasElement.querySelector('[data-emoji="😀"]');
		await expect(grinning).toBeInTheDocument();
		if (grinning == null) throw new Error(); // NOTE: not called
		await waitFor(() => userEvent.click(grinning));
		const recentUsedSection = canvas.getByText(new RegExp(i18n.ts.recentUsed)).closest('section');
		await expect(recentUsedSection).toBeInTheDocument();
		if (recentUsedSection == null) throw new Error(); // NOTE: not called
		await expect(within(recentUsedSection).getByAltText('😀')).toBeInTheDocument();
		await expect(within(recentUsedSection).queryByAltText('😬')).toEqual(null);
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkEmojiPicker>;
