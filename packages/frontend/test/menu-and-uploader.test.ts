/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, beforeEach, describe, test } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import './init';
import MkMenu from '@/components/MkMenu.vue';
import MkUploaderItems from '@/components/MkUploaderItems.vue';
import { popups } from '@/os.js';
import { preferState } from './init.js';
import { IMAGE_EDITING_SUPPORTED_TYPES, THUMBNAIL_SUPPORTED_TYPES } from '@/composables/use-uploader.js';
import type { UploaderItem } from '@/composables/use-uploader.js';
import { getDragData, setDragData } from '@/drag-and-drop.js';
import { i18n } from '@/i18n.js';

describe('menu and uploader regressions', () => {
	const originalMenuStyle = preferState.menuStyle;

	beforeEach(() => {
		preferState.menuStyle = 'drawer';
		popups.value = [];
		window.document.body.removeAttribute('inert');
	});

	afterEach(() => {
		cleanup();
		popups.value = [];
		preferState.menuStyle = originalMenuStyle;
		window.document.body.removeAttribute('inert');
	});

	test('drawer parent menu items open their child menu on tap', async () => {
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
						asDrawer: true,
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

		assert.exists(await view.findByText('Preset A'));
	});

	test('avif uploads keep thumbnails and editing menu support', () => {
		assert.include(THUMBNAIL_SUPPORTED_TYPES, 'image/avif');
		assert.include(IMAGE_EDITING_SUPPORTED_TYPES, 'image/avif');
	});

	test('drag data keeps uploader file objects intact after reordering', () => {
		const data = new Map<string, string>();
		const file = new File(['hello'], 'hello.jpg', { type: 'image/jpeg' });
		const event = {
			dataTransfer: {
				setData(type: string, value: string) {
					data.set(type, value);
				},
				getData(type: string) {
					return data.get(type) ?? '';
				},
			},
		} as DragEvent;

		setDragData(event, 'MkDraggable', {
			item: {
				id: 'item-1',
				file,
			} as { id: string },
			instanceId: 'instance-1',
			group: 'group-1',
		});

		const dragged = getDragData(event, 'MkDraggable') as {
			item: { id: string; file: File };
			instanceId: string;
			group: string;
		};

		assert.strictEqual(dragged.item.file, file);
		assert.strictEqual(dragged.item.file.type, 'image/jpeg');
	});

	test('uploader items render queued image previews', () => {
		const item: UploaderItem = {
			id: 'item-1',
			name: 'hello.jpg',
			suffix: '.jpg',
			progress: null,
			thumbnail: 'blob:http://example.test/preview',
			preprocessing: false,
			preprocessProgress: null,
			uploading: false,
			uploaded: null,
			uploadFailed: false,
			aborted: false,
			compressionLevel: 0,
			file: new File(['hello'], 'hello.jpg', { type: 'image/jpeg' }),
			watermarkPreset: null,
			watermarkLayers: null,
			imageFrameParams: null,
		};

		const view = render(MkUploaderItems, {
			props: {
				items: [item],
				showAddButton: true,
			},
			global: {
				directives: {
					panel: {
						mounted() {},
					},
				},
				stubs: {
					MkCondensedLine: {
						props: ['minScale'],
						template: '<span><slot /></span>',
					},
				},
			},
		});

		assert.exists(view.getByText('hello.jpg'));
		assert.exists(view.getByRole('button', { name: i18n.ts.menu }));
	});
});
