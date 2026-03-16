/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, beforeEach, describe, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import './init';
import { popups } from '@/os.js';
import { preferState } from './init.js';

vi.mock('@/utility/touch.js', () => ({
	isTouchUsing: true,
	isHorizontalSwipeSwiping: { value: false },
}));

describe('MkMenu on touch devices', () => {
	const originalMenuStyle = preferState.menuStyle;

	beforeEach(() => {
		preferState.menuStyle = 'popup';
		popups.value = [];
		window.document.body.removeAttribute('inert');
	});

	afterEach(() => {
		cleanup();
		popups.value = [];
		preferState.menuStyle = originalMenuStyle;
		window.document.body.removeAttribute('inert');
	});

	test('opens parent items as stacked menus instead of side flyouts', async () => {
		const { default: MkMenu } = await import('@/components/MkMenu.vue');

		const Wrapper = defineComponent({
			components: {
				MkMenu,
			},
			setup() {
				const hidden = ref(false);
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
					hidden,
					items,
					popups,
				};
			},
			render() {
				return h('div', [
					!this.hidden ? h(MkMenu, {
						items: this.items,
						asDrawer: false,
						onHide: () => {
							this.hidden = true;
						},
					}) : null,
					...this.popups.map(popup => h(popup.component, {
						key: popup.id,
						...popup.props,
						...popup.events,
					})),
				]);
			},
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

		assert.isTrue(view.queryByRole('menuitem', { name: 'Watermark' }) == null);
		assert.exists(await view.findByText('Preset A'));
	});
});
