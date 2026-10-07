<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_s">
	<MkNote :note="note" compact/>
	<MkButton v-if="note.repliesCount > 0 && !loaded" small :class="$style.loadReplies" @click="loadReplies">{{ i18n.ts.loadReplies }} ({{ note.repliesCount }})</MkButton>
	<div v-if="loaded" class="_gaps_s" :class="$style.replies">
		<div v-for="reply in replies" :key="reply.id" class="_gaps_s">
			<MkA v-if="reply.replyId !== note.id" class="_link" :to="`/notes/${reply.replyId}`">{{ i18n.ts.reply }}</MkA>
			<MkNote :note="reply" compact/>
		</div>
		<MkInfo v-if="truncated" warn>{{ i18n.ts._community.threadLimit }}</MkInfo>
		<MkError v-if="error" @retry="loadReplies"/>
		<MkButton v-else-if="hasMore" :disabled="loading" @click="loadReplies">{{ i18n.ts._community.olderReplies }}</MkButton>
		<MkLoading v-if="loading"/>
	</div>
</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { entities } from 'misskey-js';
import MkNote from '@/components/MkNote.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { useGlobalEvent } from '@/events.js';

const props = defineProps<{ note: entities.Note }>();
const replies = ref<entities.Note[]>([]);
const loaded = ref(false);
const loading = ref(false);
const hasMore = ref(true);
const truncated = ref(false);
const error = ref(false);
const threadNoteIds = new Set([props.note.id]);
let cursor: string | undefined;
let reloadPending = false;

useGlobalEvent('notePosted', posted => {
	if (posted.replyId == null || !threadNoteIds.has(posted.replyId)) return;
	reloadPending = true;
	if (!loading.value) void reloadReplies();
});

async function reloadReplies() {
	reloadPending = false;
	replies.value = [];
	cursor = undefined;
	await loadReplies();
}

async function loadReplies() {
	if (loading.value) return;
	loading.value = true;
	loaded.value = true;
	error.value = false;
	try {
		const response = await misskeyApi('notes/replies-thread', { noteId: props.note.id, untilId: cursor, limit: 20 });
		for (const reply of response.items) threadNoteIds.add(reply.id);
		replies.value.push(...response.items.filter(item => !replies.value.some(existing => existing.id === item.id)));
		cursor = response.nextCursor ?? undefined;
		hasMore.value = response.hasMore;
		truncated.value = response.truncated;
	} catch { error.value = true; } finally {
		loading.value = false;
		if (reloadPending) void reloadReplies();
	}
}
</script>

<style module lang="scss">
.loadReplies { margin-left: 62px; }
.replies {
	margin-left: 16px;
	padding-left: 12px;
	border-left: 1px solid var(--MI_THEME-divider);
}
</style>
