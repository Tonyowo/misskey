/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { emojilist } from '@@/js/emojilist.js';
import { delay, http, HttpResponse } from 'msw';
import MkEmojiPickerGrid from './MkEmojiPickerGrid.vue';
import type { StoryObj } from '@storybook/vue3';

function customEmojiItems(count: number) {
	return Array.from({ length: count }, (_, index) => `:story_emoji_${index.toString().padStart(4, '0')}:`);
}

export const Default = {
	render(args) {
		return {
			components: { MkEmojiPickerGrid },
			setup() {
				return { args };
			},
			template: '<MkEmojiPickerGrid v-bind="args" style="width: 286px; height: 240px;"/>',
		};
	},
	args: {
		items: emojilist.slice(0, 120).map(emoji => emoji.char),
		columns: 6,
		itemSize: 45,
		ariaLabel: 'Emoji',
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkEmojiPickerGrid>;

export const ThousandItems = {
	...Default,
	args: {
		...Default.args,
		items: emojilist.slice(0, 1000).map(emoji => emoji.char),
	},
} satisfies StoryObj<typeof MkEmojiPickerGrid>;

export const Empty = {
	...Default,
	args: {
		...Default.args,
		items: [],
	},
} satisfies StoryObj<typeof MkEmojiPickerGrid>;

export const Static = {
	...Default,
	args: {
		...Default.args,
		items: emojilist.slice(0, 12).map(emoji => emoji.char),
		virtualized: false,
	},
} satisfies StoryObj<typeof MkEmojiPickerGrid>;

export const CustomEmojis100 = {
	...Default,
	args: {
		...Default.args,
		items: customEmojiItems(100),
	},
} satisfies StoryObj<typeof MkEmojiPickerGrid>;

export const CustomEmojis500 = {
	...Default,
	args: {
		...Default.args,
		items: customEmojiItems(500),
	},
} satisfies StoryObj<typeof MkEmojiPickerGrid>;

export const CustomEmojis1000 = {
	...Default,
	args: {
		...Default.args,
		items: customEmojiItems(1000),
	},
} satisfies StoryObj<typeof MkEmojiPickerGrid>;

export const SlowAndFailedImages = {
	...Default,
	args: {
		...Default.args,
		items: customEmojiItems(100),
	},
	parameters: {
		msw: {
			handlers: [
				http.get('/emoji/:name.webp', async ({ params }) => {
					await delay(1200);
					if (String(params.name).endsWith('5')) return new HttpResponse(null, { status: 404 });
					const image = await (await window.fetch('/client-assets/fedi.jpg')).blob();
					return new HttpResponse(image, {
						headers: {
							'Content-Type': 'image/jpeg',
						},
					});
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkEmojiPickerGrid>;

export const Responsive = {
	...Default,
	args: {
		...Default.args,
		responsive: true,
	},
} satisfies StoryObj<typeof MkEmojiPickerGrid>;
