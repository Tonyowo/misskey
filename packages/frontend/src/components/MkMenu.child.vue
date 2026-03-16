<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" :class="$style.root">
	<MkMenu :items="items" :align="align" :width="width" :asDrawer="false" @close="onChildClosed"/>
</div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, provide, useTemplateRef, watch } from 'vue';
import MkMenu from './MkMenu.vue';
import { calculateNestedMenuPosition } from './MkMenu.position.js';
import type { MenuItem } from '@/types/menu.js';

const props = defineProps<{
	items: MenuItem[];
	anchorElement: HTMLElement;
	rootElement: HTMLElement;
	width?: number;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
	(ev: 'actioned'): void;
}>();

provide('isNestingMenu', true);

const el = useTemplateRef('el');
const align = 'left';

const VIEWPORT_MARGIN = 16;
const SCROLLBAR_THICKNESS = 16;

function setPosition() {
	if (el.value == null) return;
	const rootRect = props.rootElement.getBoundingClientRect();
	const parentRect = props.anchorElement.getBoundingClientRect();
	const myRect = el.value.getBoundingClientRect();

	const { left, top } = calculateNestedMenuPosition({
		rootRect,
		parentRect,
		menuRect: myRect,
		anchorWidth: props.anchorElement.offsetWidth,
		viewportWidth: window.innerWidth,
		viewportHeight: window.innerHeight,
		viewportMargin: VIEWPORT_MARGIN,
		scrollbarThickness: SCROLLBAR_THICKNESS,
	});

	el.value.style.left = left + 'px';
	el.value.style.top = top + 'px';
}

function onChildClosed(actioned?: boolean) {
	if (actioned) {
		emit('actioned');
	} else {
		emit('closed');
	}
}

watch(() => props.anchorElement, () => {
	setPosition();
});

const ro = new ResizeObserver(() => {
	setPosition();
});

onMounted(() => {
	if (el.value) ro.observe(el.value);
	setPosition();
	nextTick(() => {
		setPosition();
	});
});

onUnmounted(() => {
	ro.disconnect();
});

defineExpose({
	checkHit: (ev: MouseEvent) => {
		return (ev.target === el.value || el.value?.contains(ev.target as Node));
	},
});
</script>

<style lang="scss" module>
.root {
	position: absolute;
	z-index: 1;
}
</style>
