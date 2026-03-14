<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span :class="[$style.root, { [$style.nowrap]: nowrap }]">
	<template v-for="(segment, index) in segments" :key="`${index}:${segment.type}`">
		<span v-if="segment.type === 'text'">{{ segment.value }}</span>
		<span v-else :class="$style.customEmojiSlot">
			<span :class="$style.customEmojiGhost">{{ segment.code }}</span>
			<MkCustomEmoji
				:name="segment.name"
				normal
				:fallbackToImage="false"
				ignoreMuted
				:class="$style.customEmoji"
			/>
		</span>
	</template>
	<span :class="$style.sentinel">&#8203;</span>
</span>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import { customEmojisMap } from '@/custom-emojis.js';

type Segment =
	| { type: 'text'; value: string }
	| { type: 'customEmoji'; name: string; code: string };

const props = withDefaults(defineProps<{
	text: string;
	nowrap?: boolean;
}>(), {
	nowrap: false,
});

const customEmojiRegex = /:([a-zA-Z0-9_+\-]+(?:@[a-zA-Z0-9.\-]+)?):/g;

const segments = computed<Segment[]>(() => {
	const value = props.text ?? '';

	if (value === '') {
		return [{ type: 'text', value: '' }];
	}

	const result: Segment[] = [];
	let lastIndex = 0;

	for (const match of value.matchAll(customEmojiRegex)) {
		const matchIndex = match.index ?? -1;
		if (matchIndex < 0) continue;

		if (matchIndex > lastIndex) {
			result.push({
				type: 'text',
				value: value.slice(lastIndex, matchIndex),
			});
		}

		const emojiName = match[1];
		if (!emojiName.includes('@') && !customEmojisMap.has(emojiName)) {
			result.push({
				type: 'text',
				value: match[0],
			});
			lastIndex = matchIndex + match[0].length;
			continue;
		}

		result.push({
			type: 'customEmoji',
			name: emojiName,
			code: match[0],
		});

		lastIndex = matchIndex + match[0].length;
	}

	if (lastIndex < value.length) {
		result.push({
			type: 'text',
			value: value.slice(lastIndex),
		});
	}

	return result.length > 0 ? result : [{ type: 'text', value }];
});
</script>

<style lang="scss" module>
.root {
	display: block;
	white-space: pre-wrap;
	overflow-wrap: break-word;
	word-break: break-word;
}

.nowrap {
	white-space: pre;
	word-break: normal;
	overflow-wrap: normal;
}

.customEmojiSlot {
	position: relative;
	display: inline-block;
	vertical-align: baseline;
}

.customEmojiGhost {
	color: transparent;
	opacity: 0;
	user-select: none;
}

.customEmoji {
	position: absolute;
	left: 50%;
	top: 50%;
	transform: translate(-50%, -50%);
	pointer-events: none;
	max-width: calc(100% - 0.2em);
}

.sentinel {
	opacity: 0;
	user-select: none;
}
</style>
