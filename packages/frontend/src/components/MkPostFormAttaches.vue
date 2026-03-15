<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" v-show="props.modelValue.length !== 0" :class="$style.root">
	<MkDraggable
		:modelValue="props.modelValue"
		:class="$style.files"
		direction="horizontal"
		@update:modelValue="v => emit('update:modelValue', v)"
	>
		<template #default="{ item }">
			<div
				:data-grid-sort-id="item.id"
				:class="[
					$style.file,
					{
						[$style.fileTouchDragging]: touchDraggingItemId === item.id,
						[$style.fileTouchDropTarget]: touchDropTargetItemId === item.id,
					},
				]"
				:style="getTouchDragStyle(item.id)"
				:title="item.name"
				role="button"
				tabindex="0"
				@click="onFileClick(item, $event)"
				@keydown.space.enter.prevent="onFileClick(item, $event)"
				@contextmenu.prevent.stop="showFileMenu(item, $event)"
				@touchstart="onItemTouchStart(item, $event)"
			>
				<!-- pointer-eventsをnoneにしておかないとiOSなどでドラッグしたときに画像の方に判定が持ってかれる -->
				<MkDriveFileThumbnail style="pointer-events: none;" :data-id="item.id" :class="$style.thumbnail" :file="item" fit="cover"/>
				<div v-if="item.isSensitive" :class="$style.sensitive" style="pointer-events: none;">
					<i class="ti ti-eye-exclamation" style="margin: auto;"></i>
				</div>
				<button
					type="button"
					class="_button"
					:class="$style.menuButton"
					:aria-label="i18n.ts.menu"
					draggable="false"
					@touchstart.stop
					@pointerdown.stop
					@click.stop.prevent="showFileMenu(item, $event)"
				>
					<i class="ti ti-settings"></i>
				</button>
			</div>
		</template>
		<template v-if="props.showAddButton && props.modelValue.length > 0" #footer>
			<button
				type="button"
				:class="[$style.file, $style.addButton]"
				@click="emit('add', $event)"
			>
				<i class="ti ti-plus"></i>
			</button>
		</template>
	</MkDraggable>
	<p
		:class="[$style.remain, {
			[$style.exceeded]: props.modelValue.length > props.maxFiles,
		}]"
	>
		{{ props.modelValue.length }}/{{ props.maxFiles }}
	</p>
</div>
</template>

<script lang="ts" setup>
import { inject, ref } from 'vue';
import * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu';
import { useLongPressGridSort } from '@/composables/use-long-press-grid-sort.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import MkDraggable from '@/components/MkDraggable.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { globalEvents } from '@/events.js';

const props = withDefaults(defineProps<{
	modelValue: Misskey.entities.DriveFile[];
	detachMediaFn?: (id: string) => void;
	showAddButton?: boolean;
	maxFiles?: number;
}>(), {
	maxFiles: 18,
});

const mock = inject(DI.mock, false);
const rootEl = ref<HTMLElement | null>(null);

const emit = defineEmits<{
	(ev: 'update:modelValue', value: Misskey.entities.DriveFile[]): void;
	(ev: 'detach', id: string): void;
	(ev: 'changeSensitive', file: Misskey.entities.DriveFile, isSensitive: boolean): void;
	(ev: 'changeName', file: Misskey.entities.DriveFile, newName: string): void;
	(ev: 'add', event: MouseEvent): void;
}>();

let menuShowing = false;

const {
	touchDraggingItemId,
	touchDropTargetItemId,
	onItemTouchStart,
	shouldSuppressActivation,
	getTouchDragStyle,
} = useLongPressGridSort({
	rootEl,
	getItems: () => props.modelValue,
	onReorder: value => emit('update:modelValue', value),
});

function detachMedia(id: string) {
	if (mock) return;

	if (props.detachMediaFn) {
		props.detachMediaFn(id);
	} else {
		emit('detach', id);
	}
}

async function detachAndDeleteMedia(file: Misskey.entities.DriveFile) {
	if (mock) return;

	detachMedia(file.id);

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.driveFileDeleteConfirm({ name: file.name }),
	});
	if (canceled) return;

	await os.apiWithDialog('drive/files/delete', {
		fileId: file.id,
	});

	globalEvents.emit('driveFilesDeleted', [file]);
}

function toggleSensitive(file: Misskey.entities.DriveFile) {
	if (mock) {
		emit('changeSensitive', file, !file.isSensitive);
		return;
	}

	misskeyApi('drive/files/update', {
		fileId: file.id,
		isSensitive: !file.isSensitive,
	}).then(() => {
		emit('changeSensitive', file, !file.isSensitive);
	});
}

async function rename(file: Misskey.entities.DriveFile) {
	if (mock) return;

	const { canceled, result } = await os.inputText({
		title: i18n.ts.enterFileName,
		default: file.name,
		minLength: 1,
	});
	if (canceled) return;
	misskeyApi('drive/files/update', {
		fileId: file.id,
		name: result,
	}).then(() => {
		emit('changeName', file, result);
		file.name = result;
	});
}

async function describe(file: Misskey.entities.DriveFile) {
	if (mock) return;

	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkFileCaptionEditWindow.vue').then(x => x.default), {
		default: file.comment !== null ? file.comment : '',
		file: file,
	}, {
		done: caption => {
			let comment = caption.length === 0 ? null : caption;
			misskeyApi('drive/files/update', {
				fileId: file.id,
				comment: comment,
			}).then(() => {
				file.comment = comment;
			});
		},
		closed: () => dispose(),
	});
}

async function openPreview(file: Misskey.entities.DriveFile) {
	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkImgPreviewDialog.vue').then(x => x.default), {
		file: file,
	}, {
		closed: () => dispose(),
	});
}

function onFileClick(file: Misskey.entities.DriveFile, ev: MouseEvent | KeyboardEvent) {
	if (shouldSuppressActivation()) {
		return;
	}

	if (file.type.startsWith('image/')) {
		openPreview(file);
		return;
	}

	if (ev instanceof KeyboardEvent) {
		showFileMenu(file, ev);
	}
}

function showFileMenu(file: Misskey.entities.DriveFile, ev: MouseEvent | PointerEvent | KeyboardEvent): void {
	if (menuShowing) return;

	const isImage = file.type.startsWith('image/');

	const menuItems: MenuItem[] = [];

	menuItems.push({
		text: i18n.ts.renameFile,
		icon: 'ti ti-forms',
		action: () => { rename(file); },
	}, {
		text: file.isSensitive ? i18n.ts.unmarkAsSensitive : i18n.ts.markAsSensitive,
		icon: file.isSensitive ? 'ti ti-eye-exclamation' : 'ti ti-eye',
		action: () => { toggleSensitive(file); },
	}, {
		text: i18n.ts.describeFile,
		icon: 'ti ti-text-caption',
		action: () => { describe(file); },
	});

	if (isImage) {
		menuItems.push({
			text: i18n.ts.preview,
			icon: 'ti ti-photo-search',
			action: () => { openPreview(file); },
		});
	}

	menuItems.push({
		type: 'divider',
	}, {
		text: i18n.ts.attachCancel,
		icon: 'ti ti-circle-x',
		action: () => { detachMedia(file.id); },
	}, {
		text: i18n.ts.deleteFile,
		icon: 'ti ti-trash',
		danger: true,
		action: () => { detachAndDeleteMedia(file); },
	});

	if (prefer.s.devMode) {
		menuItems.push({ type: 'divider' }, {
			icon: 'ti ti-hash',
			text: i18n.ts.copyFileId,
			action: () => {
				copyToClipboard(file.id);
			},
		});
	}

	const openMenu = ev.type === 'contextmenu'
		? os.contextMenu(menuItems, ev as PointerEvent)
		: os.popupMenu(menuItems, ev.currentTarget ?? ev.target);

	openMenu.then(() => menuShowing = false);
	menuShowing = true;
}
</script>

<style lang="scss" module>
.root {
	--tile-size: 104px;
	--tile-gap: 8px;
	padding: 8px 16px;
	position: relative;
}

.files {
	align-items: flex-start;
	justify-content: flex-start;
	margin: calc(var(--tile-gap) / -2);
	max-width: min(100%, calc(var(--tile-size) * 3 + var(--tile-gap) * 3));

	> * {
		flex: 0 0 calc(100% / 3);
		max-width: calc(100% / 3);
		padding: calc(var(--tile-gap) / 2);
		box-sizing: border-box;
	}
}

.file {
	position: relative;
	display: block;
	width: 100%;
	aspect-ratio: 1;
	padding: 0;
	border: 0;
	border-radius: 12px;
	overflow: hidden;
	cursor: grab;
	background: var(--MI_THEME-panel);
	-webkit-touch-callout: none;
	user-select: none;

	&:active {
		cursor: grabbing;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 3px;
	}
}

.file.fileTouchDragging {
	z-index: 4;
	cursor: grabbing;
	pointer-events: none;
	transform: translate(var(--grid-drag-x, 0), var(--grid-drag-y, 0)) scale(1.04);
	transition: none;
	box-shadow: 0 16px 36px color(from #000 srgb r g b / 0.28);
}

.file.fileTouchDropTarget {
	box-shadow: inset 0 0 0 2px color(from var(--MI_THEME-accent) srgb r g b / 0.7);
}

.menuButton {
	position: absolute;
	right: 6px;
	top: 6px;
	z-index: 3;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	padding: 0;
	border-radius: 999px;
	background: transparent;
	color: rgba(255, 255, 255, 0.96);
	box-shadow: none;
	opacity: 0.58;
	transition: transform 0.16s ease, opacity 0.16s ease;

	> i {
		font-size: 1.15rem;
		filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
	}

	&:hover,
	&:focus-visible {
		opacity: 0.92;
		transform: scale(1.08);
	}
}

.thumbnail {
	width: 100%;
	height: 100%;
	z-index: 1;
	color: var(--MI_THEME-fg);
}

.sensitive {
	display: flex;
	position: absolute;
	inset: 0;
	top: 0;
	left: 0;
	z-index: 2;
	background: rgba(17, 17, 17, .7);
	color: #fff;
}

.addButton {
	display: flex;
	align-items: center;
	justify-content: center;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.65);
	background:
		linear-gradient(var(--MI_THEME-panel), var(--MI_THEME-panel)) padding-box,
		linear-gradient(135deg, color(from var(--MI_THEME-accent) srgb r g b / 0.4), color(from var(--MI_THEME-fg) srgb r g b / 0.15)) border-box;
	border: 1px dashed transparent;
	cursor: pointer;
	font-size: 2rem;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}

.remain {
	display: block;
	position: absolute;
	top: 8px;
	right: 8px;
	margin: 0;
	padding: 0;
	font-size: 90%;

	&.exceeded {
		color: var(--MI_THEME-error);
	}
}
</style>
