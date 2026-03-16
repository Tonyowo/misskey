/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, beforeEach, describe, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, nextTick } from 'vue';
import './init';
import { preferState } from './init.js';

vi.mock('@/utility/touch.js', () => ({
	isTouchUsing: true,
	isHorizontalSwipeSwiping: { value: false },
}));

describe('MkMenu on touch devices', () => {
	const originalMenuStyle = preferState.menuStyle;

	beforeEach(() => {
		preferState.menuStyle = 'popup';
		window.document.body.removeAttribute('inert');
	});

	afterEach(() => {
		cleanup();
		preferState.menuStyle = originalMenuStyle;
		window.document.body.removeAttribute('inert');
	});

	test('keeps parent menus visible while opening touch child flyouts', async () => {
		const { default: MkMenu } = await import('@/components/MkMenu.vue');

		const Wrapper = defineComponent({
			components: {
				MkMenu,
			},
			setup() {
				const items = [{
					type: 'parent' as const,
					text: 'Watermark',
					children: [{
						type: 'button' as const,
						text: 'Preset A',
						action: () => {},
					}],
				}];

				return {
					items,
				};
			},
			template: '<MkMenu :items="items" :asDrawer="false" />',
		});

		const view = render(Wrapper, {
			global: {
				directives: {
					hotkey: {
						mounted() {},
						unmounted() {},
					},
				},
				stubs: {
					MkA: true,
					MkAvatar: true,
					MkEllipsis: true,
					MkUserName: true,
				},
			},
		});

		await fireEvent.click(view.getByRole('menuitem', { name: 'Watermark' }));
		await nextTick();

		assert.exists(view.getByRole('menuitem', { name: 'Watermark' }));
		assert.exists(await view.findByText('Preset A'));
	});
});
