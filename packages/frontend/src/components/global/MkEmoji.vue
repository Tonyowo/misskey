<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<img v-if="shouldMute" :class="$style.root" src="/client-assets/unknown.png" :alt="props.emoji" decoding="async" :loading="loading" @load="emit('load')" @error="emit('error')" @pointerenter="computeTitle" @click="onClick"/>
<img v-else-if="!useOsNativeEmojis" :class="$style.root" :src="url" :alt="props.emoji" decoding="async" :loading="loading" @load="emit('load')" @error="onError" @pointerenter="computeTitle" @click="onClick"/>
<span v-else :alt="props.emoji" @pointerenter="computeTitle" @click="onClick">{{ colorizedNativeEmoji }}</span>
</template>

<script lang="ts" setup>
import { computed, inject, ref, watch } from 'vue';
import { colorizeEmoji, getEmojiName } from '@@/js/emojilist.js';
import { char2fluentEmojiFilePath, char2twemojiFilePath } from '@@/js/emoji-base.js';
import type { MenuItem } from '@/types/menu.js';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { mute as muteEmoji, unmute as unmuteEmoji } from '@/utility/emoji-mute.js';
import { addToEmojiPalette } from '@/utility/emoji-palette.js';

const props = defineProps<{
	emoji: string;
	menu?: boolean;
	menuReaction?: boolean;
	ignoreMuted?: boolean;
	loading?: 'eager' | 'lazy';
}>();

const emit = defineEmits<{
	(ev: 'load'): void;
	(ev: 'error'): void;
}>();

const react = inject(DI.mfmEmojiReactCallback, null);

const useOsNativeEmojis = computed(() => prefer.s.emojiStyle === 'native');
const errored = ref(false);
const primaryUrl = computed(() => prefer.s.emojiStyle === 'twemoji' ? char2twemojiFilePath(props.emoji) : char2fluentEmojiFilePath(props.emoji));
const fallbackUrl = computed(() => prefer.s.emojiStyle === 'fluentEmoji' ? char2twemojiFilePath(props.emoji) : null);
const url = computed(() => (errored.value && fallbackUrl.value) ? fallbackUrl.value : primaryUrl.value);
const colorizedNativeEmoji = computed(() => colorizeEmoji(props.emoji));
const isMuted = computed(() => prefer.r.mutingEmojis.value.includes(props.emoji));
const shouldMute = computed(() => isMuted.value && !props.ignoreMuted);

watch(() => [props.emoji, prefer.s.emojiStyle], () => {
	errored.value = false;
});

watch(useOsNativeEmojis, (value) => {
	if (value) emit('load');
}, { immediate: true, flush: 'post' });

// Searching from an array with 2000 items for every emoji felt like too energy-consuming, so I decided to do it lazily on pointerenter
function computeTitle(event: PointerEvent): void {
	(event.target as HTMLElement).title = getEmojiName(props.emoji);
}

function onError() {
	if (fallbackUrl.value != null && url.value !== fallbackUrl.value) {
		errored.value = true;
	} else {
		emit('error');
	}
}

function mute() {
	os.confirm({
		type: 'question',
		title: i18n.tsx.muteX({ x: props.emoji }),
	}).then(({ canceled }) => {
		if (canceled) {
			return;
		}
		muteEmoji(props.emoji);
	});
}

function unmute() {
	os.confirm({
		type: 'question',
		title: i18n.tsx.unmuteX({ x: props.emoji }),
	}).then(({ canceled }) => {
		if (canceled) {
			return;
		}
		unmuteEmoji(props.emoji);
	});
}

function onClick(ev: PointerEvent) {
	if (props.menu) {
		const menuItems: MenuItem[] = [];

		menuItems.push({
			type: 'label',
			text: props.emoji,
		}, {
			text: i18n.ts.copy,
			icon: 'ti ti-copy',
			action: () => {
				copyToClipboard(props.emoji);
			},
		});

		if (props.menuReaction && react) {
			menuItems.push({
				text: i18n.ts.doReaction,
				icon: 'ti ti-plus',
				action: () => {
					react(props.emoji);
				},
			});
		}

		menuItems.push({
			type: 'divider',
		});

		if (isMuted.value) {
			menuItems.push({
				text: i18n.ts.emojiUnmute,
				icon: 'ti ti-mood-smile',
				action: () => {
					unmute();
				},
			});
		} else {
			menuItems.push({
				text: i18n.ts.emojiMute,
				icon: 'ti ti-mood-off',
				action: () => {
					mute();
				},
			});
		}

		menuItems.push({
			text: i18n.ts.addToEmojiPalette,
			icon: 'ti ti-palette',
			action: () => {
				addToEmojiPalette(props.emoji);
			},
		});

		os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
	}
}
</script>

<style lang="scss" module>
.root {
	height: 1.25em;
	vertical-align: -0.25em;
}
</style>
