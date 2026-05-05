<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialogEl"
	:width="480"
	:height="null"
	:withOkButton="true"
	:okButtonDisabled="content.trim() === ''"
	@ok="done()"
	@close="cancel()"
	@closed="emit('closed')"
	@esc="cancel()"
>
	<template #header>{{ i18n.ts.replyVisible }}</template>

	<div :class="$style.body">
		<MkTextarea
			v-model="content"
			:placeholder="String(i18n.ts.replyVisiblePlaceholder)"
			:autofocus="true"
			:mfmAutocomplete="true"
			:mfmPreview="true"
			tall
		>
			<template #caption>{{ i18n.ts.replyVisibleDialogText }}</template>
		</MkTextarea>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	defaultValue?: string;
}>();

const emit = defineEmits<{
	(ev: 'done', result: { canceled: true } | { canceled: false; result: string }): void;
	(ev: 'closed'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');
const content = ref(props.defaultValue ?? '');

function done() {
	const result = content.value.trim();
	if (result === '') return;

	emit('done', { canceled: false, result });
	dialogEl.value?.close();
}

function cancel() {
	emit('done', { canceled: true });
	dialogEl.value?.close();
}
</script>

<style lang="scss" module>
.body {
	padding: 20px;
}
</style>
