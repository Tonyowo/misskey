<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<ChatHome :tab="tab" :filter="filter" :q="q" :focus="focus"/>
</template>

<script lang="ts" setup>
import ChatHome from '@/pages/chat/home.vue';
import type { ChatHomeFocusTarget, ChatHomeTab } from '@/pages/chat/home.route.js';
import type { ChatConversationFilter } from '@/pages/chat/history-items.js';

// Preserve the previous messages URL while sharing the complete conversation UI.
defineProps<{
	tab?: ChatHomeTab;
	filter?: ChatConversationFilter;
	q?: string;
	focus?: ChatHomeFocusTarget;
}>();
</script>
