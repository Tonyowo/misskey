<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkDraggable
		:modelValue="props.items"
		:class="$style.items"
		direction="horizontal"
		:manualDragStart="isTouchDevice"
		@update:modelValue="items => emit('update:items', items)"
	>
		<template #default="{ item, dragStart }">
			<div
				v-panel
				:class="[$style.item, { [$style.itemWaiting]: item.preprocessing, [$style.itemCompleted]: item.uploaded, [$style.itemFailed]: item.uploadFailed }]"
				:style="{
					'--p': item.progress != null ? `${item.progress.value / item.progress.max * 100}%` : '0%',
					'--pp': item.preprocessProgress != null ? `${item.preprocessProgress * 100}%` : '100%',
				}"
				:title="item.name"
				role="button"
				tabindex="0"
				@click="onActivate(item, $event)"
				@pointerdown="onPointerdown(item, $event)"
				@pointerup="cancelLongPress"
				@pointercancel="cancelLongPress"
				@pointerleave="cancelLongPress"
				@pointermove="onPointermove($event)"
				@keydown.space.enter.prevent="onActivate(item, $event)"
				@contextmenu.prevent.stop="onContextmenu(item, $event)"
			>
				<div :class="$style.itemThumbnail" :style="item.thumbnail ? { backgroundImage: `url(${item.thumbnail})` } : undefined">
					<div v-if="!item.thumbnail" :class="$style.itemFallback">
						<i class="ti ti-file"></i>
					</div>
					<div v-if="item.isSensitive" :class="$style.itemSensitive">
						<i class="ti ti-eye-exclamation"></i>
					</div>
					<div :class="$style.itemName">
						<MkCondensedLine :minScale="2 / 3">{{ item.name }}</MkCondensedLine>
					</div>
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
		<template v-if="props.showAddButton && props.items.length > 0" #footer>
			<button
				v-panel
				type="button"
				:class="[$style.item, $style.addButton]"
				@click="emit('selectMore', $event)"
			>
				<i class="ti ti-plus"></i>
			</button>
		</template>
	</MkDraggable>
</div>
</template>

<script lang="ts" setup>
import { isLink } from '@@/js/is-link.js';
import type { UploaderItem } from '@/composables/use-uploader.js';
import MkDraggable from '@/components/MkDraggable.vue';
import * as os from '@/os.js';
import { isTouchUsing } from '@/utility/touch.js';

const props = withDefaults(defineProps<{
	items: UploaderItem[];
	showAddButton?: boolean;
}>(), {
	showAddButton: false,
});

const emit = defineEmits<{
	(ev: 'update:items', items: UploaderItem[]): void;
	(ev: 'showMenu', item: UploaderItem, event: MouseEvent | PointerEvent | KeyboardEvent): void;
	(ev: 'showMenuViaContextmenu', item: UploaderItem, event: PointerEvent): void;
	(ev: 'selectMore', event: MouseEvent): void;
}>();

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

function onPointerdown(item: UploaderItem, ev: PointerEvent) {
	if (!isTouchDevice || ev.pointerType !== 'touch' || isDragHandleTarget(ev.target)) return;

	clearLongPressTimer();
	longPressStartPoint = { x: ev.clientX, y: ev.clientY };
	longPressTimer = window.setTimeout(() => {
		suppressNextActivation = true;
		lastTouchMenuOpenedAt = Date.now();
		emit('showMenu', item, ev);
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

function onContextmenu(item: UploaderItem, ev: PointerEvent) {
	if (isTouchDevice && Date.now() - lastTouchMenuOpenedAt < 500) return;
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;

	emit('showMenuViaContextmenu', item, ev);
}

function isPreviewableImage(item: UploaderItem): item is UploaderItem & { thumbnail: string } {
	return item.file.type.startsWith('image/') && item.thumbnail != null;
}

async function openPreview(item: UploaderItem) {
	if (!isPreviewableImage(item)) return;

	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkImgPreviewDialog.vue').then(x => x.default), {
		src: item.thumbnail,
		name: item.name,
		alt: item.caption ?? item.name,
	}, {
		closed: () => dispose(),
	});
}

function onActivate(item: UploaderItem, ev: MouseEvent | KeyboardEvent) {
	if (suppressNextActivation) {
		suppressNextActivation = false;
		return;
	}

	if (isPreviewableImage(item)) {
		openPreview(item);
		return;
	}

	if (ev instanceof KeyboardEvent) {
		emit('showMenu', item, ev);
	}
}
</script>

<style lang="scss" module>
.root {
	position: relative;
}

.items {
	--tile-size: 104px;
	--tile-gap: 8px;
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

.item {
	position: relative;
	display: block;
	width: 100%;
	aspect-ratio: 1;
	padding: 0;
	border: 0;
	border-radius: 12px;
	overflow: clip;
	cursor: grab;
	background: var(--MI_THEME-panel);

	&:active {
		cursor: grabbing;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 3px;
	}

	&::before {
		content: '';
		display: block;
		position: absolute;
		top: 0;
		left: 0;
		width: var(--p);
		height: 100%;
		background: color(from var(--MI_THEME-accent) srgb r g b / 0.5);
		transition: width 0.2s ease, left 0.2s ease;
	}

	&.itemWaiting {
		&::after {
			--c: color(from var(--MI_THEME-accent) srgb r g b / 0.25);

			content: '';
			display: block;
			position: absolute;
			top: 0;
			left: 0;
			width: var(--pp, 100%);
			height: 100%;
			background: linear-gradient(-45deg, transparent 25%, var(--c) 25%,var(--c) 50%, transparent 50%, transparent 75%, var(--c) 75%, var(--c));
			background-size: 25px 25px;
			animation: stripe .8s infinite linear;
		}
	}

	&.itemCompleted {
		&::before {
			left: 100%;
			width: var(--p);
		}
		box-shadow: inset 0 0 0 1px color(from var(--MI_THEME-accent) srgb r g b / 0.6);
	}

	&.itemFailed {
		box-shadow: inset 0 0 0 1px color(from var(--MI_THEME-error) srgb r g b / 0.7);
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

.itemThumbnail {
	position: relative;
	z-index: 1;
	width: 100%;
	height: 100%;
	background-color: var(--MI_THEME-bg);
	background-size: cover;
	background-position: center;
	background-repeat: no-repeat;
	pointer-events: none;
}

.itemFallback {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 2rem;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.5);
	pointer-events: none;
}

.itemSensitive {
	position: absolute;
	top: 8px;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 999px;
	backdrop-filter: blur(10px);
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.7);
	color: #fff;
	pointer-events: none;
}

.itemSensitive {
	left: 8px;
	color: var(--MI_THEME-warn);
}

.itemName {
	position: absolute;
	right: 0;
	bottom: 0;
	left: 0;
	padding: 18px 8px 8px;
	font-size: 0.8rem;
	line-height: 1.2;
	color: #fff;
	background: linear-gradient(to top, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0));
	pointer-events: none;
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

@keyframes stripe {
	0% { background-position-x: 0; }
	100% { background-position-x: -25px; }
}

@media (max-width: 420px) {
	.items {
		max-width: 100%;
	}
}
</style>
