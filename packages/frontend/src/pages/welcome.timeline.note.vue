<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :key="note.id" :class="$style.note">
	<div class="_panel _gaps_s" :class="$style.content">
		<div v-if="hasCw" :class="$style.richcontent">
			<div><Mfm :text="note.cw" :author="note.user"/></div>
			<MkCwButton v-if="note.canRevealCw !== false" v-model="showContent" :text="note.text" :renote="note.renote" :files="note.files" :poll="note.poll" style="margin: 4px 0;"/>
			<div v-else style="margin-top: 4px; opacity: 0.8; font-size: 0.9em;">
				<i class="ti ti-lock" style="margin-right: 4px;"></i>{{ i18n.ts.replyToSeeCw }}
			</div>
			<div v-if="note.canRevealCw !== false && showContent">
				<MkA v-if="note.replyId" class="reply" :to="`/notes/${note.replyId}`"><i class="ti ti-arrow-back-up"></i></MkA>
				<Mfm v-if="note.text" :text="note.text" :author="note.user"/>
				<MkA v-if="note.renoteId" class="rp" :to="`/notes/${note.renoteId}`">RN: ...</MkA>
			</div>
		</div>
		<div v-else ref="noteTextEl" :class="[$style.text, { [$style.collapsed]: shouldCollapse }]">
			<MkA v-if="note.replyId" class="reply" :to="`/notes/${note.replyId}`"><i class="ti ti-arrow-back-up"></i></MkA>
			<Mfm v-if="note.text" :text="note.text" :author="note.user"/>
			<MkA v-if="note.renoteId" class="rp" :to="`/notes/${note.renoteId}`">RN: ...</MkA>
		</div>
		<div v-if="note.files && note.files.length > 0 && (!hasCw || (note.canRevealCw !== false && showContent))" :class="$style.richcontent">
			<MkMediaList :mediaList="note.files.slice(0, 4)" layout="nineGrid"/>
		</div>
		<div v-if="note.reactionCount > 0" :class="$style.reactions">
			<MkReactionsViewer :noteId="note.id" :reactions="note.reactions" :reactionEmojis="note.reactionEmojis" :myReaction="note.myReaction" :maxNumber="16"/>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef, onUpdated, onMounted } from 'vue';
import * as Misskey from 'misskey-js';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import MkPoll from '@/components/MkPoll.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	note: Misskey.entities.Note;
}>();

const note = computed(() => props.note);
const noteTextEl = useTemplateRef('noteTextEl');
const shouldCollapse = ref(false);
const showContent = ref(false);
const hasCw = computed(() => props.note.cw != null);

function calcCollapse() {
	if (noteTextEl.value) {
		const height = noteTextEl.value.scrollHeight;
		if (height > 200) {
			shouldCollapse.value = true;
		}
	}
}

onMounted(() => {
	calcCollapse();
});

onUpdated(() => {
	calcCollapse();
});
</script>

<style lang="scss" module>
.note {
	margin-left: auto;
}

.text {
	position: relative;
	max-height: 200px;
	overflow: hidden;

	&.collapsed::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		height: 64px;
		background: linear-gradient(0deg, var(--MI_THEME-panel), color(from var(--MI_THEME-panel) srgb r g b / 0));
	}
}

.content {
	padding: 16px;
	margin: 0 0 0 auto;
	max-width: max-content;
	border-radius: 16px;
}

.reactions {
	box-sizing: border-box;
	margin: 8px -16px -8px;
	padding: 8px 16px 0;
	width: calc(100% + 32px);
	border-top: 1px solid var(--MI_THEME-divider);
}

.richcontent {
	min-width: 250px;
}
</style>
