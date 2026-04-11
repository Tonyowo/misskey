<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<MkPolkadots v-if="tab === 'conversation'" accented :height="200" style="margin-bottom: -200px;"/>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<XHome v-if="tab === 'conversation'"/>
		<XGroups v-else-if="tab === 'groups'"/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onActivated, onMounted, ref } from 'vue';
import XHome from './home.home.vue';
import XGroups from './home.groups.vue';
import type { PageHeaderItem } from '@/types/page-header.js';
import { definePage } from '@/page.js';
import MkPolkadots from '@/components/MkPolkadots.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useGlobalEvent } from '@/events.js';

type ChatSummary = {
	invitations: number;
	myRequests: number;
	joiningRooms: number;
	ownedRooms: number;
	pendingRequests: number;
	unreadConversations: number;
};

const tab = ref<'conversation' | 'groups'>('conversation');
const summary = ref<ChatSummary>({
	invitations: 0,
	myRequests: 0,
	joiningRooms: 0,
	ownedRooms: 0,
	pendingRequests: 0,
	unreadConversations: 0,
});

const pendingCount = computed(() => summary.value.invitations + summary.value.myRequests + summary.value.pendingRequests);

const headerActions = computed<PageHeaderItem[]>(() => pendingCount.value > 0 ? [{
	icon: 'ti ti-inbox',
	text: `待处理 ${pendingCount.value}`,
	highlighted: true,
	handler: () => {
		tab.value = 'groups';
	},
}] : []);

const headerTabs = computed(() => [{
	key: 'conversation',
	title: '会话',
	icon: 'ti ti-message-circle',
}, {
	key: 'groups',
	title: '群聊',
	icon: 'ti ti-users-group',
}]);

async function fetchCounts() {
	summary.value = await misskeyApi<ChatSummary>('chat/summary' as never, {} as never);
}

onMounted(() => {
	fetchCounts();
});

onActivated(() => {
	void fetchCounts();
});

useGlobalEvent('chatHomeInvalidated', () => {
	void fetchCounts();
});

definePage(() => ({
	title: '聊天',
	icon: 'ti ti-messages',
}));
</script>

<style lang="scss" module>
</style>
