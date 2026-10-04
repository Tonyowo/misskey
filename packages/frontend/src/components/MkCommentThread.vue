<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_s" :class="$style.root">
	<MkNoteSimple :note="note" live/>
	<div class="_buttons">
		<MkButton small @click="replyTo(note)">{{ i18n.ts.reply }}</MkButton>
		<MkButton v-if="note.repliesCount > 0 && !loaded" small @click="loadReplies">{{ i18n.ts.loadReplies }} ({{ note.repliesCount }})</MkButton>
	</div>
	<div v-if="loaded" class="_gaps_s" :class="$style.replies">
		<div v-for="reply in replies" :key="reply.id" class="_gaps_s">
			<MkA v-if="reply.replyId !== note.id" class="_link" :to="`/notes/${reply.replyId}`">{{ i18n.ts.reply }}</MkA>
			<MkNoteSimple :note="reply" live/>
			<MkButton small @click="replyTo(reply)">{{ i18n.ts.reply }}</MkButton>
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
import MkNoteSimple from '@/components/MkNoteSimple.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { pleaseLogin } from '@/utility/please-login.js';

const props = defineProps<{ note: entities.Note }>();
const replies = ref<entities.Note[]>([]);
const loaded = ref(false);
const loading = ref(false);
const hasMore = ref(true);
const truncated = ref(false);
const error = ref(false);
let cursor: string | undefined;

async function loadReplies() {
	if (loading.value) return;
	loading.value = true;
	loaded.value = true;
	error.value = false;
	try {
		const response = await misskeyApi('notes/replies-thread', { noteId: props.note.id, untilId: cursor, limit: 20 });
		replies.value.push(...response.items.filter(item => !replies.value.some(existing => existing.id === item.id)));
		cursor = response.nextCursor ?? undefined;
		hasMore.value = response.hasMore;
		truncated.value = response.truncated;
	} catch { error.value = true; } finally { loading.value = false; }
}

async function replyTo(note: entities.Note) {
	if (!await pleaseLogin()) return;
	await os.post({ reply: note, channel: note.channel });
	replies.value = [];
	cursor = undefined;
	await loadReplies();
}
</script>

<style module lang="scss">
.root { padding: 16px; }
.replies {
	margin-left: 16px;
	padding-left: 12px;
	border-left: 1px solid var(--MI_THEME-divider);
}
</style>
