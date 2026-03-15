<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-show="props.modelValue.length !== 0" :class="$style.root">
	<MkDraggable
		:modelValue="props.modelValue"
		:class="$style.files"
		direction="horizontal"
		:manualDragStart="isTouchDevice"
		@update:modelValue="v => emit('update:modelValue', v)"
	>
		<template #default="{ item, dragStart }">
			<div
				:class="$style.file"
				:title="item.name"
				role="button"
				tabindex="0"
				@click="onFileClick(item, $event)"
				@pointerdown="onPointerdown(item, $event)"
				@pointerup="cancelLongPress"
				@pointercancel="cancelLongPress"
				@pointerleave="cancelLongPress"
				@pointermove="onPointermove($event)"
				@keydown.space.enter.prevent="onFileClick(item, $event)"
				@contextmenu.prevent.stop="showFileMenu(item, $event)"
			>
				<!-- pointer-eventsをnoneにしておかないとiOSなどでドラッグしたときに画像の方に判定が持ってかれる -->
				<MkDriveFileThumbnail style="pointer-events: none;" :data-id="item.id" :class="$style.thumbnail" :file="item" fit="cover"/>
				<div v-if="item.isSensitive" :class="$style.sensitive" style="pointer-events: none;">
					<i class="ti ti-eye-exclamation" style="margin: auto;"></i>
				</div>
				<button
					v-if="isTouchDevice"
					type="button"
					class="_button"
					:class="$style.dragHandle"
					data-drag-handle
					tabindex="-1"
					:draggable="true"
					@click.stop.prevent
					@dragstart.stop="dragStart"
				>
					<i class="ti ti-arrows-move"></i>
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
import { inject } from 'vue';
import * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu';
import { copyToClipboard } from '@/utility/copy-to-clipboard';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import MkDraggable from '@/components/MkDraggable.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { globalEvents } from '@/events.js';
import { isTouchUsing } from '@/utility/touch.js';

const props = withDefaults(defineProps<{
	modelValue: Misskey.entities.DriveFile[];
	detachMediaFn?: (id: string) => void;
	showAddButton?: boolean;
	maxFiles?: number;
}>(), {
	maxFiles: 18,
});

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'update:modelValue', value: Misskey.entities.DriveFile[]): void;
	(ev: 'detach', id: string): void;
	(ev: 'changeSensitive', file: Misskey.entities.DriveFile, isSensitive: boolean): void;
	(ev: 'changeName', file: Misskey.entities.DriveFile, newName: string): void;
	(ev: 'add', event: MouseEvent): void;
}>();

let menuShowing = false;
const isTouchDevice = isTouchUsing;
const LONG_PRESS_MS = 420;
const LONG_PRESS_CANCEL_DISTANCE = 12;

let longPressTimer: number | null = null;
let longPressStartPoint: { x: number; y: number } | null = null;
let suppressNextActivation = false;
let lastTouchMenuOpenedAt = 0;

function clearLongPressTimer() {
	if (longPressTimer != null) {
		window.clearTimeout(longPressTimer);
		longPressTimer = null;
	}
	longPressStartPoint = null;
}

function isDragHandleTarget(target: EventTarget | null) {
	return target instanceof HTMLElement && target.closest('[data-drag-handle]') != null;
}

function onPointerdown(file: Misskey.entities.DriveFile, ev: PointerEvent) {
	if (!isTouchDevice || ev.pointerType !== 'touch' || isDragHandleTarget(ev.target)) return;

	clearLongPressTimer();
	longPressStartPoint = { x: ev.clientX, y: ev.clientY };
	longPressTimer = window.setTimeout(() => {
		suppressNextActivation = true;
		lastTouchMenuOpenedAt = Date.now();
		showFileMenu(file, ev);
		clearLongPressTimer();
	}, LONG_PRESS_MS);
}

function onPointermove(ev: PointerEvent) {
	if (!isTouchDevice || longPressTimer == null || longPressStartPoint == null) return;

	if (Math.hypot(ev.clientX - longPressStartPoint.x, ev.clientY - longPressStartPoint.y) > LONG_PRESS_CANCEL_DISTANCE) {
		clearLongPressTimer();
	}
}

function cancelLongPress() {
	clearLongPressTimer();
}

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
	if (suppressNextActivation) {
		suppressNextActivation = false;
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
	if (isTouchDevice && ev.type === 'contextmenu' && Date.now() - lastTouchMenuOpenedAt < 500) return;

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

	&:active {
		cursor: grabbing;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 3px;
	}
}

.dragHandle {
	position: absolute;
	right: 8px;
	bottom: 8px;
	z-index: 2;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	border-radius: 999px;
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.88);
	color: var(--MI_THEME-fg);
	box-shadow: 0 4px 12px color(from #000 srgb r g b / 0.18);
	touch-action: none;
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
