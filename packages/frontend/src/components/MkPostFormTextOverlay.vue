<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" aria-hidden="true">
	<template v-for="(segment, index) in segments" :key="`${segment.type}:${index}`">
		<span v-if="segment.type === 'text'">{{ segment.value }}</span>
		<span v-else :class="$style.customEmojiToken">
			<span :class="$style.customEmojiCode">{{ segment.value }}</span>
			<span :class="$style.customEmojiVisual">
				<MkCustomEmoji :name="segment.name" :normal="true" :fallbackToImage="true"/>
			</span>
		</span>
	</template>
	<span>{{ trailingFiller }}</span>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import { customEmojisMap } from '@/custom-emojis.js';
import { tokenizePostFormCustomEmojis } from '@/utility/post-form-custom-emojis.js';

const props = defineProps<{
	text: string;
}>();

const segments = computed(() => tokenizePostFormCustomEmojis(props.text, (name) => customEmojisMap.has(name)));
const trailingFiller = computed(() => props.text.endsWith('\n') || props.text === '' ? '\u200b' : '');
</script>

<style lang="scss" module>
.root {
	display: block;
	min-height: 100%;
	white-space: pre-wrap;
	overflow-wrap: break-word;
	word-break: break-word;
	color: var(--MI_THEME-fg);
}

.customEmojiToken {
	position: relative;
	display: inline-block;
}

.customEmojiCode {
	visibility: hidden;
}

.customEmojiVisual {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
}
</style>
