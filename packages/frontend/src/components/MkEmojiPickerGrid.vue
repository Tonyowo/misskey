<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	ref="rootEl"
	:class="[$style.root, { [$style.static]: !virtualized }]"
	:style="rootStyle"
	role="grid"
	:aria-label="ariaLabel"
	:aria-rowcount="totalRows"
	:aria-colcount="columns"
	@scroll.passive="onScroll"
>
	<div v-if="virtualized" :class="$style.spacer" :style="{ height: `${virtualRange.totalHeight + GRID_PADDING * 2}px` }">
		<div :class="$style.virtualWindow" :style="{ transform: `translateY(${virtualRange.offsetTop + GRID_PADDING}px)` }">
			<div
				v-for="row in visibleRows"
				:key="row.index"
				:class="$style.row"
				role="row"
				:aria-rowindex="row.index + 1"
			>
				<button
					v-for="entry in row.entries"
					:key="entry.emoji"
					class="_button"
					:class="[$style.item, { [$style.loaded]: loadedEmojis.has(entry.emoji), [$style.animated]: animated }]"
					:data-emoji="entry.emoji"
					:data-emoji-index="entry.index"
					:disabled="disabledEmojiSet.has(entry.emoji)"
					:tabindex="entry.index === focusedIndex ? 0 : -1"
					role="gridcell"
					:aria-colindex="entry.index % columns + 1"
					:aria-label="getEmojiName(entry.emoji)"
					@focus="focusedIndex = entry.index"
					@keydown="onKeydown($event, entry.index)"
					@click="emit('chosen', entry.emoji, $event)"
				>
					<span v-if="!loadedEmojis.has(entry.emoji)" :class="$style.placeholder" aria-hidden="true"></span>
					<span :class="$style.emoji">
						<MkCustomEmoji
							v-if="entry.emoji.startsWith(':')"
							:name="entry.emoji"
							:normal="true"
							:fallbackToImage="true"
							:loading="getLoadingMode(entry.index)"
							@load="markLoaded(entry.emoji)"
							@error="markLoaded(entry.emoji)"
						/>
						<MkEmoji
							v-else
							:emoji="entry.emoji"
							:normal="true"
							:loading="getLoadingMode(entry.index)"
							@load="markLoaded(entry.emoji)"
							@error="markLoaded(entry.emoji)"
						/>
					</span>
				</button>
			</div>
		</div>
	</div>
	<div v-else :class="$style.staticWindow">
		<div
			v-for="row in staticRows"
			:key="row.index"
			:class="$style.row"
			role="row"
			:aria-rowindex="row.index + 1"
		>
			<button
				v-for="entry in row.entries"
				:key="entry.emoji"
				class="_button"
				:class="[$style.item, { [$style.loaded]: loadedEmojis.has(entry.emoji), [$style.animated]: animated }]"
				:data-emoji="entry.emoji"
				:data-emoji-index="entry.index"
				:disabled="disabledEmojiSet.has(entry.emoji)"
				:tabindex="entry.index === focusedIndex ? 0 : -1"
				role="gridcell"
				:aria-colindex="entry.index % columns + 1"
				:aria-label="getEmojiName(entry.emoji)"
				@focus="focusedIndex = entry.index"
				@keydown="onKeydown($event, entry.index)"
				@click="emit('chosen', entry.emoji, $event)"
			>
				<span v-if="!loadedEmojis.has(entry.emoji)" :class="$style.placeholder" aria-hidden="true"></span>
				<span :class="$style.emoji">
					<MkCustomEmoji
						v-if="entry.emoji.startsWith(':')"
						:name="entry.emoji"
						:normal="true"
						:fallbackToImage="true"
						loading="eager"
						@load="markLoaded(entry.emoji)"
						@error="markLoaded(entry.emoji)"
					/>
					<MkEmoji
						v-else
						:emoji="entry.emoji"
						:normal="true"
						loading="eager"
						@load="markLoaded(entry.emoji)"
						@error="markLoaded(entry.emoji)"
					/>
				</span>
			</button>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef, watch } from 'vue';
import { getEmojiName } from '@@/js/emojilist.js';
import { getEmojiPickerVirtualRange } from '@/utility/emoji-picker-data.js';

const GRID_PADDING = 8;

const props = withDefaults(defineProps<{
	items: string[];
	disabledItems?: string[];
	columns: number;
	itemSize: number;
	virtualized?: boolean;
	responsive?: boolean;
	animated?: boolean;
	ariaLabel: string;
}>(), {
	disabledItems: () => [],
	virtualized: true,
	responsive: false,
	animated: true,
});

const emit = defineEmits<{
	(ev: 'chosen', emoji: string, event: PointerEvent): void;
}>();

const rootEl = useTemplateRef('rootEl');
const scrollTop = ref(0);
const viewportHeight = ref(0);
const measuredItemSize = ref(1);
const focusedIndex = ref(0);
const loadedEmojis = reactive(new Set<string>());
let resizeObserver: ResizeObserver | null = null;

const disabledEmojiSet = computed(() => new Set(props.disabledItems));
const cellSize = computed(() => props.responsive ? measuredItemSize.value : props.itemSize);
const totalRows = computed(() => Math.ceil(props.items.length / Math.max(props.columns, 1)));
const virtualRange = computed(() => getEmojiPickerVirtualRange({
	itemCount: props.items.length,
	columns: props.columns,
	rowHeight: cellSize.value,
	viewportHeight: viewportHeight.value,
	scrollTop: Math.max(0, scrollTop.value - GRID_PADDING),
}));
const eagerRange = computed(() => getEmojiPickerVirtualRange({
	itemCount: props.items.length,
	columns: props.columns,
	rowHeight: cellSize.value,
	viewportHeight: viewportHeight.value,
	scrollTop: Math.max(0, scrollTop.value - GRID_PADDING),
	overscanRows: 0,
}));
const visibleEntries = computed(() => {
	return props.items
		.slice(virtualRange.value.startIndex, virtualRange.value.endIndex)
		.map((emoji, offset) => ({
			emoji,
			index: virtualRange.value.startIndex + offset,
		}));
});
const visibleRows = computed(() => groupEntriesByRow(visibleEntries.value));
const staticRows = computed(() => groupEntriesByRow(props.items.map((emoji, index) => ({ emoji, index }))));
const rootStyle = computed(() => ({
	'--emojiPickerColumns': `${props.columns}`,
	'--emojiPickerItemSize': `${cellSize.value}px`,
}));

function groupEntriesByRow(entries: { emoji: string; index: number }[]) {
	const rows = new Map<number, { emoji: string; index: number }[]>();
	for (const entry of entries) {
		const rowIndex = Math.floor(entry.index / Math.max(props.columns, 1));
		const row = rows.get(rowIndex);
		if (row) {
			row.push(entry);
		} else {
			rows.set(rowIndex, [entry]);
		}
	}
	return Array.from(rows, ([index, rowEntries]) => ({ index, entries: rowEntries }));
}

watch(() => [props.items, props.columns], () => {
	reset();
});

function updateMeasurements() {
	const root = rootEl.value;
	if (root == null) return;

	viewportHeight.value = root.clientHeight;
	if (props.responsive) {
		measuredItemSize.value = Math.max(1, (root.clientWidth - GRID_PADDING * 2) / Math.max(props.columns, 1));
	} else {
		measuredItemSize.value = props.itemSize;
	}
}

function onScroll() {
	scrollTop.value = rootEl.value?.scrollTop ?? 0;
}

function getLoadingMode(index: number): 'eager' | 'lazy' {
	return index >= eagerRange.value.startIndex && index < eagerRange.value.endIndex ? 'eager' : 'lazy';
}

function markLoaded(emoji: string) {
	loadedEmojis.add(emoji);
}

function findFocusableIndex(start: number, step: number): number {
	let index = start;
	while (index >= 0 && index < props.items.length) {
		const emoji = props.items[index];
		if (!disabledEmojiSet.value.has(emoji)) return index;
		index += step;
	}
	return Math.min(Math.max(start, 0), Math.max(props.items.length - 1, 0));
}

function focusIndex(index: number) {
	if (props.items.length === 0) return;

	const nextIndex = findFocusableIndex(index, index >= focusedIndex.value ? 1 : -1);
	focusedIndex.value = nextIndex;

	if (props.virtualized) {
		const row = Math.floor(nextIndex / Math.max(props.columns, 1));
		const rowTop = row * cellSize.value + GRID_PADDING;
		const rowBottom = rowTop + cellSize.value;
		const root = rootEl.value;
		if (root) {
			if (rowTop < root.scrollTop) root.scrollTop = rowTop;
			if (rowBottom > root.scrollTop + root.clientHeight) root.scrollTop = rowBottom - root.clientHeight;
			onScroll();
		}
	}

	nextTick(() => {
		rootEl.value?.querySelector<HTMLElement>(`[data-emoji-index="${nextIndex}"]`)?.focus();
	});
}

function onKeydown(event: KeyboardEvent, index: number) {
	let nextIndex: number | null = null;

	switch (event.key) {
		case 'ArrowRight':
			nextIndex = index + 1;
			break;
		case 'ArrowLeft':
			nextIndex = index - 1;
			break;
		case 'ArrowDown':
			nextIndex = index + props.columns;
			break;
		case 'ArrowUp':
			nextIndex = index - props.columns;
			break;
		case 'Home':
			nextIndex = 0;
			break;
		case 'End':
			nextIndex = props.items.length - 1;
			break;
		default:
			return;
	}

	event.preventDefault();
	focusIndex(Math.min(Math.max(nextIndex, 0), Math.max(props.items.length - 1, 0)));
}

function reset() {
	if (rootEl.value) rootEl.value.scrollTop = 0;
	scrollTop.value = 0;
	focusedIndex.value = findFocusableIndex(0, 1);
	nextTick(updateMeasurements);
}

function focus() {
	focusIndex(focusedIndex.value);
}

onMounted(() => {
	updateMeasurements();
	if (typeof ResizeObserver !== 'undefined') {
		resizeObserver = new ResizeObserver(updateMeasurements);
		const root = rootEl.value;
		if (root) resizeObserver.observe(root);
	}
});

onBeforeUnmount(() => {
	resizeObserver?.disconnect();
});

defineExpose({
	focus,
	reset,
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	min-height: 0;
	overflow-y: auto;
	overflow-x: hidden;
	scrollbar-width: none;
}

.static {
	overflow: visible;
}

.spacer {
	position: relative;
	width: 100%;
}

.row {
	display: grid;
	grid-template-columns: repeat(var(--emojiPickerColumns), minmax(0, 1fr));
	grid-auto-rows: var(--emojiPickerItemSize);
}

.virtualWindow {
	position: absolute;
	top: 0;
	left: 8px;
	right: 8px;
}

.staticWindow {
	padding: 8px;
}

.item {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	height: var(--emojiPickerItemSize);
	min-width: 0;
	padding: 3px;
	contain: strict;
	border-radius: 8px;
	font-size: 24px;

	&:hover {
		background: var(--MI_THEME-panelHighlight);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}

	&:active {
		background: var(--MI_THEME-accentedBg);
	}

	&:disabled {
		cursor: not-allowed;
		background: linear-gradient(
			-45deg,
			transparent 0% 48%,
			color-mix(in srgb, var(--MI_THEME-fg) 24%, transparent) 48% 52%,
			transparent 52% 100%
		);
		opacity: 1;

		.emoji {
			filter: grayscale(1);
			opacity: 0.65;
		}
	}

	&.loaded {
		.emoji {
			opacity: 1;
		}
	}

	&.animated {
		.emoji {
			transition: opacity 0.16s ease;
		}

		.placeholder {
			animation: placeholderPulse 1.1s ease-in-out infinite alternate;
		}
	}
}

.emoji {
	position: relative;
	z-index: 1;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	height: 100%;
	opacity: 0;

	> img,
	> span {
		width: 100%;
		height: 1.25em;
		object-fit: contain;
		vertical-align: -0.25em;
		pointer-events: none;
	}
}

.placeholder {
	position: absolute;
	inset: 22%;
	border-radius: 30%;
	background: var(--MI_THEME-panelHighlight);
}

@keyframes placeholderPulse {
	from {
		opacity: 0.45;
	}

	to {
		opacity: 0.9;
	}
}

@media (prefers-reduced-motion: reduce) {
	.item .emoji {
		transition: none;
	}

	.item .placeholder {
		animation: none;
	}
}
</style>
