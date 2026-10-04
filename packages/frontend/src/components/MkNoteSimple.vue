<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="note" :class="$style.root">
	<MkAvatar :class="[$style.avatar, prefer.s.useStickyIcons ? $style.useSticky : null]" :user="note.user" link preview/>
	<div :class="$style.main">
		<MkNoteHeader :class="$style.header" :note="note" :mini="true"/>
		<div>
			<p v-if="hasCw" :class="$style.cw">
				<Mfm v-if="note.cw != ''" style="margin-right: 8px;" :text="note.cw ?? ''" :author="note.user" :nyaize="'respect'" :emojiUrls="note.emojis"/>
				<MkCwButton v-model="showContent" :text="note.text" :files="note.files" :poll="note.poll"/>
			</p>
			<div v-show="!hasCw || showContent">
				<MkSubNoteContent :class="$style.text" :note="note"/>
			</div>
		</div>
	</div>
</div>
<div v-else :class="$style.deleted">
	{{ i18n.ts.deletedNote }}
</div>
</template>

<script lang="ts" setup>
import { computed, ref, reactive, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkSubNoteContent from '@/components/MkSubNoteContent.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { useNoteCapture } from '@/composables/use-note-capture.js';
import { useGlobalEvent } from '@/events.js';
import { deepClone } from '@/utility/clone.js';

const props = defineProps<{
	note: Misskey.entities.Note | null;
	live?: boolean;
}>();

const showContent = ref(false);
const liveNote = props.live && props.note ? reactive(deepClone(props.note)) : null;
const deleted = ref(false);
const note = computed(() => props.live ? (deleted.value ? null : liveNote) : props.note);
const hasCw = computed(() => note.value?.cw != null);
if (liveNote) {
	useNoteCapture({ note: liveNote, parentNote: null, forceCapture: true }).subscribe();
	useGlobalEvent('noteUpdated', updated => {
		if (updated.id !== liveNote.id) return;
		showContent.value = false;
		Object.assign(liveNote, deepClone(updated));
	});
	useGlobalEvent('noteDeleted', id => {
		if (id === liveNote.id) deleted.value = true;
	});
	watch(() => props.note, updated => {
		if (!updated || updated.id !== liveNote.id) return;
		showContent.value = false;
		Object.assign(liveNote, deepClone(updated));
	});
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	margin: 0;
	padding: 0;
	font-size: 0.95em;
}

.avatar {
	flex-shrink: 0;
	display: block;
	margin: 0 10px 0 0;
	width: 34px;
	height: 34px;
	border-radius: 8px;

	&.useSticky {
		position: sticky !important;
		top: calc(16px + var(--MI-stickyTop, 0px));
		left: 0;
	}
}

.main {
	flex: 1;
	min-width: 0;
}

.header {
	margin-bottom: 2px;
}

.cw {
	cursor: default;
	display: block;
	margin: 0;
	padding: 0;
	overflow-wrap: break-word;
}

.text {
	cursor: default;
	margin: 0;
	padding: 0;
}

@container (min-width: 250px) {
	.avatar {
		margin: 0 10px 0 0;
		width: 40px;
		height: 40px;
	}
}

@container (min-width: 350px) {
	.avatar {
		margin: 0 10px 0 0;
		width: 44px;
		height: 44px;
	}
}

@container (min-width: 500px) {
	.avatar {
		margin: 0 12px 0 0;
		width: 48px;
		height: 48px;
	}
}

.deleted {
	text-align: center;
	padding: 8px !important;
	--color: light-dark(rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.15));
	background-size: auto auto;
	background-image: repeating-linear-gradient(135deg, transparent, transparent 10px, var(--color) 4px, var(--color) 14px);
	border-radius: 8px;
}
</style>
