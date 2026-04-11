<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root">
	<div :class="$style.header">
		<button
			type="button"
			class="_button"
			:class="$style.headerButton"
			:aria-controls="bodyId"
			:aria-expanded="showBody"
			@click="showBody = !showBody"
		>
			<div :class="$style.title"><div><slot name="header"></slot></div></div>
			<div :class="$style.divider"></div>
			<div :class="$style.button" aria-hidden="true">
				<template v-if="showBody"><i class="ti ti-chevron-up"></i></template>
				<template v-else><i class="ti ti-chevron-down"></i></template>
			</div>
		</button>
	</div>
	<Transition
		:enterActiveClass="prefer.s.animation ? $style.folderToggleEnterActive : ''"
		:leaveActiveClass="prefer.s.animation ? $style.folderToggleLeaveActive : ''"
		:enterFromClass="prefer.s.animation ? $style.folderToggleEnterFrom : ''"
		:leaveToClass="prefer.s.animation ? $style.folderToggleLeaveTo : ''"
		@enter="enter"
		@afterEnter="afterEnter"
		@leave="leave"
		@afterLeave="afterLeave"
	>
		<div v-show="showBody" :id="bodyId">
			<slot></slot>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { miLocalStorage } from '@/local-storage.js';
import { prefer } from '@/preferences.js';
import { globalEvents } from '@/events.js';
import { getBgColor } from '@/utility/get-bg-color.js';
import { genId } from '@/utility/id.js';

const miLocalStoragePrefix = 'ui:folder:' as const;

const props = withDefaults(defineProps<{
	expanded?: boolean;
	persistKey?: string | null;
}>(), {
	expanded: true,
	persistKey: null,
});

const rootEl = useTemplateRef('rootEl');
const parentBg = ref<string | null>(null);
const bodyId = genId();
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const showBody = ref((props.persistKey && miLocalStorage.getItem(`${miLocalStoragePrefix}${props.persistKey}`)) ? (miLocalStorage.getItem(`${miLocalStoragePrefix}${props.persistKey}`) === 't') : props.expanded);

watch(showBody, () => {
	if (props.persistKey) {
		miLocalStorage.setItem(`${miLocalStoragePrefix}${props.persistKey}`, showBody.value ? 't' : 'f');
	}
});

function enter(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	const elementHeight = el.getBoundingClientRect().height;
	el.style.height = '0';
	el.offsetHeight; // reflow
	el.style.height = `${elementHeight}px`;
}

function afterEnter(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	el.style.height = '';
}

function leave(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	const elementHeight = el.getBoundingClientRect().height;
	el.style.height = `${elementHeight}px`;
	el.offsetHeight; // reflow
	el.style.height = '0';
}

function afterLeave(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	el.style.height = '';
}

function updateBgColor() {
	if (rootEl.value) {
		parentBg.value = getBgColor(rootEl.value.parentElement);
	}
}

onMounted(() => {
	updateBgColor();
	globalEvents.on('themeChanging', updateBgColor);
});

onBeforeUnmount(() => {
	globalEvents.off('themeChanging', updateBgColor);
});
</script>

<style lang="scss" module>
.folderToggleEnterActive, .folderToggleLeaveActive {
	overflow-y: clip;
	transition: opacity 0.5s, height 0.5s !important;
}

.folderToggleEnterFrom, .folderToggleLeaveTo {
	opacity: 0;
}

.root {
	position: relative;
}

.header {
	position: relative;
	z-index: 10;
	position: sticky;
	top: var(--MI-stickyTop, 0px);
	-webkit-backdrop-filter: var(--MI-blur, blur(8px));
	backdrop-filter: var(--MI-blur, blur(20px));
	background-color: color(from v-bind("parentBg ?? 'var(--bg)'") srgb r g b / 0.85);
}

.headerButton {
	display: flex;
	align-items: center;
	width: 100%;
	color: inherit;
}

.title {
	display: grid;
	place-content: center;
	margin: 0;
	padding: 12px 16px 12px 0;
}

.divider {
	flex: 1;
	margin: auto;
	height: 1px;
	background: var(--MI_THEME-divider);
}

.button {
	padding: 12px 0 12px 16px;
}

@container (max-width: 500px) {
	.title {
		padding: 8px 10px 8px 0;
	}
}
</style>
