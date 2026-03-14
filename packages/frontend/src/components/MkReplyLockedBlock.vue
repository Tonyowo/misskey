<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.locked]: locked }]">
	<div :class="$style.header">
		<i class="ti ti-lock" :class="$style.icon"></i>
		<Mfm
			v-if="title != null && title !== ''"
			:text="title"
			:author="user"
			:nyaize="'respect'"
			:emojiUrls="emojiUrls"
			:enableEmojiMenu="enableEmojiMenu"
			:enableEmojiMenuReaction="enableEmojiMenuReaction"
			:class="$style.title"
		/>
		<span v-else :class="$style.fallbackTitle">{{ i18n.ts.cwReplyRequired }}</span>
	</div>
	<div v-if="locked" :class="$style.placeholder">
		{{ i18n.ts.replyToSeeCw }}
	</div>
	<Mfm
		v-else-if="text != null && text !== ''"
		:text="text"
		:author="user"
		:nyaize="'respect'"
		:emojiUrls="emojiUrls"
		:enableEmojiMenu="enableEmojiMenu"
		:enableEmojiMenuReaction="enableEmojiMenuReaction"
		:class="[$style.body, { ['_selectable']: selectable }]"
	/>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';

withDefaults(defineProps<{
	title?: string | null;
	text?: string | null;
	locked: boolean;
	user: Misskey.entities.User;
	emojiUrls?: Record<string, string>;
	selectable?: boolean;
	enableEmojiMenu?: boolean;
	enableEmojiMenuReaction?: boolean;
}>(), {
	title: null,
	text: null,
	emojiUrls: undefined,
	selectable: false,
	enableEmojiMenu: false,
	enableEmojiMenuReaction: false,
});
</script>

<style lang="scss" module>
.root {
	margin-top: 8px;
	padding: 10px 12px;
	border: 1px dashed color-mix(in srgb, var(--MI_THEME-divider) 75%, transparent);
	border-radius: 12px;
	background: color-mix(in srgb, var(--MI_THEME-accent) 6%, transparent);
}

.locked {
	background: color-mix(in srgb, var(--MI_THEME-warn) 8%, transparent);
}

.header {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 6px;
	font-size: 0.95em;
	font-weight: 600;
}

.icon {
	flex-shrink: 0;
	opacity: 0.85;
}

.title {
	min-width: 0;
}

.fallbackTitle {
	min-width: 0;
}

.placeholder {
	opacity: 0.82;
	font-size: 0.92em;
}

.body {
	overflow-wrap: break-word;
}
</style>
