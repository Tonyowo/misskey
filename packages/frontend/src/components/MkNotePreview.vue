<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkAvatar :class="$style.avatar" :user="user"/>
	<div :class="$style.main">
		<div :class="$style.header">
			<MkUserName :user="user" :nowrap="true"/>
		</div>
		<div>
			<p v-if="hasCw" :class="$style.cw">
				<Mfm v-if="cw != null && cw != ''" :text="cw" :author="user" :nyaize="'respect'" :i="user" style="margin-right: 8px;"/>
				<div v-if="showReplyLockedContentInPreview" :class="$style.replyRequiredBadge">
					<i class="ti ti-lock"></i>{{ i18n.ts.cwReplyRequired }}
				</div>
				<MkCwButton v-else v-model="showContent" :text="text.trim()" :files="files" :poll="poll" style="margin: 4px 0;"/>
			</p>
			<div v-show="!hasCw || showReplyLockedContentInPreview || showContent">
				<Mfm :text="text.trim()" :author="user" :nyaize="'respect'" :i="user"/>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import type { PollEditorModelValue } from '@/components/MkPollEditor.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import { i18n } from '@/i18n.js';

const showContent = ref(false);

const props = defineProps<{
	text: string;
	replyLockedText?: string | null;
	files: Misskey.entities.DriveFile[];
	poll?: PollEditorModelValue;
	useCw: boolean;
	cw: string | null;
	cwReplyRequired?: boolean;
	user: Misskey.entities.User;
}>();

const hasCw = computed(() => props.useCw);
const showReplyLockedContentInPreview = computed(() => props.cwReplyRequired === true);
</script>

<style lang="scss" module>
.root {
	display: flex;
	margin: 0;
	padding: 0;
	overflow: clip;
	font-size: 0.95em;
}

.avatar {
	flex-shrink: 0 !important;
	display: block !important;
	margin: 0 10px 0 0 !important;
	width: 40px !important;
	height: 40px !important;
	border-radius: 8px !important;
	pointer-events: none !important;
}

.main {
	flex: 1;
	min-width: 0;
}

.cw {
	cursor: default;
	display: block;
	margin: 0;
	padding: 0;
	overflow-wrap: break-word;
}

.replyRequiredBadge {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin: 4px 0 0;
	font-size: 0.9em;
	color: var(--MI_THEME-warn);
}

.header {
	margin-bottom: 2px;
	font-weight: bold;
	width: 100%;
	overflow: clip;
    text-overflow: ellipsis;
}

@container (min-width: 350px) {
	.avatar {
		margin: 0 10px 0 0 !important;
		width: 44px !important;
		height: 44px !important;
	}
}

@container (min-width: 500px) {
	.avatar {
		margin: 0 12px 0 0 !important;
		width: 48px !important;
		height: 48px !important;
	}
}
</style>
