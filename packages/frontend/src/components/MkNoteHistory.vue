<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="window" :width="700" :height="650" @close="close" @esc="close" @closed="emit('closed')">
	<template #header>{{ i18n.ts._community.history }}</template>
	<div class="_spacer _gaps" style="--MI_SPACER-w: 650px;">
		<MkInfo>{{ i18n.ts._community.historyNotice }}</MkInfo>
		<MkPagination :paginator="paginator" :forceDisableInfiniteScroll="true">
			<template #default="{ items }">
				<article v-for="version in items" :key="version.id" class="_gaps_s" :class="$style.version">
					<header>{{ i18n.ts._community.history }} #{{ version.revision }} · <MkTime :time="version.createdAt"/></header>
					<MkNoteSimple :note="version.note"/>
					<MkInfo v-if="version.note.fileIds?.some(id => !version.note.files?.some(file => file.id === id))" warn>{{ i18n.ts._community.missingMedia }}</MkInfo>
				</article>
			</template>
		</MkPagination>
	</div>
</MkModalWindow>
</template>

<script setup lang="ts">
import { markRaw, useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkNoteSimple from '@/components/MkNoteSimple.vue';
import MkInfo from '@/components/MkInfo.vue';
import { Paginator } from '@/utility/paginator.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ noteId: string }>();
const emit = defineEmits<{ (event: 'closed'): void }>();
const windowRef = useTemplateRef('window');
const paginator = markRaw(new Paginator('notes/history', { limit: 20, params: { noteId: props.noteId } }));

function close() { windowRef.value?.close(); }
</script>

<style module lang="scss">
.version {
	padding: 16px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
}
</style>
