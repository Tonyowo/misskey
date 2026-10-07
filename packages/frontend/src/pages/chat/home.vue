<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<XHome
			v-if="chatAvailable && tab === 'conversation'"
			:filter="filter"
			:query="q"
			@openGroups="openGroups"
			@update:filter="filter = $event"
			@update:query="q = $event"
		/>
		<XGroups v-else-if="chatAvailable && tab === 'groups'" :focusTarget="groupsFocusTarget"/>
		<MkNotesTimeline v-else :paginator="directNotesPaginator"/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, nextTick, onActivated, onMounted, ref, watch } from 'vue';
import XHome from './home.home.vue';
import XGroups from './home.groups.vue';
import {
	buildChatHomeQuery,
	parseChatHomeFilter,
	parseChatHomeFocus,
	parseChatHomeTab,
} from './home.route.js';
import type { ChatConversationFilter } from './history-items.js';
import type { ChatHomeFocusTarget, ChatHomeTab } from './home.route.js';
import type { PageHeaderItem } from '@/types/page-header.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useGlobalEvent } from '@/events.js';
import { useRouter } from '@/router.js';
import { i18n } from '@/i18n.js';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import { Paginator } from '@/utility/paginator.js';
import { $i } from '@/i.js';

type ChatSummary = {
	invitations: number;
	myRequests: number;
	joiningRooms: number;
	ownedRooms: number;
	pendingRequests: number;
	unreadConversations: number;
	unreadDirectConversations: number;
	unreadGroupConversations: number;
	unreadMentionConversations: number;
};

type GroupFocusTarget = ChatHomeFocusTarget | null;

const props = defineProps<{
	tab?: ChatHomeTab;
	filter?: ChatConversationFilter;
	q?: string;
	focus?: ChatHomeFocusTarget;
}>();

const router = useRouter();

const chatAvailable = computed(() => $i?.policies.chatAvailability !== 'unavailable');
const tab = ref<ChatHomeTab>(chatAvailable.value ? parseChatHomeTab(props.tab) : 'directNotes');
const filter = ref<ChatConversationFilter>(parseChatHomeFilter(props.filter));
const q = ref(props.q ?? '');
const groupsFocusTarget = ref<GroupFocusTarget>(parseChatHomeFocus(props.focus));
const summary = ref<ChatSummary>({
	invitations: 0,
	myRequests: 0,
	joiningRooms: 0,
	ownedRooms: 0,
	pendingRequests: 0,
	unreadConversations: 0,
	unreadDirectConversations: 0,
	unreadGroupConversations: 0,
	unreadMentionConversations: 0,
});

const pendingCount = computed(() => summary.value.invitations + summary.value.myRequests + summary.value.pendingRequests);
const directNotesPaginator = markRaw(new Paginator('notes/mentions', {
	limit: 10,
	params: { visibility: 'specified' },
}));

const headerActions = computed<PageHeaderItem[]>(() => pendingCount.value > 0 ? [{
	icon: 'ti ti-inbox',
	text: `待处理 ${pendingCount.value}`,
	highlighted: true,
	handler: () => {
		tab.value = 'groups';
	},
}] : []);

const headerTabs = computed(() => [...(chatAvailable.value ? [{
	key: 'conversation',
	title: '会话',
	icon: 'ti ti-message-circle',
}, {
	key: 'groups',
	title: '群聊',
	icon: 'ti ti-users-group',
}] : []), {
	key: 'directNotes',
	title: i18n.ts.directNotes,
	icon: 'ti ti-mail',
}]);

let syncingRoute = false;

function syncRoute() {
	if (syncingRoute) return;

	const nextQuery = buildChatHomeQuery({
		tab: tab.value,
		filter: filter.value,
		q: q.value,
		focus: groupsFocusTarget.value,
	});

	const currentQuery = buildChatHomeQuery({
		tab: parseChatHomeTab(props.tab),
		filter: parseChatHomeFilter(props.filter),
		q: props.q ?? '',
		focus: parseChatHomeFocus(props.focus),
	});

	if (JSON.stringify(nextQuery) === JSON.stringify(currentQuery)) {
		return;
	}

	syncingRoute = true;
	router.replace(router.currentRoute.value.path === '/my/messages' ? '/my/messages' : '/chat', {
		query: nextQuery,
	});
	queueMicrotask(() => {
		syncingRoute = false;
	});
}

async function fetchCounts() {
	if (!chatAvailable.value) return;
	summary.value = await misskeyApi<ChatSummary>('chat/summary' as never, {} as never);
}

function openGroups(target: Exclude<GroupFocusTarget, null>) {
	tab.value = 'groups';
	groupsFocusTarget.value = null;
	void nextTick(() => {
		groupsFocusTarget.value = target;
	});
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

watch(() => props.tab, (value) => {
	tab.value = chatAvailable.value ? parseChatHomeTab(value) : 'directNotes';
});

watch(() => props.filter, (value) => {
	filter.value = parseChatHomeFilter(value);
});

watch(() => props.q, (value) => {
	q.value = value ?? '';
});

watch(() => props.focus, (value) => {
	groupsFocusTarget.value = parseChatHomeFocus(value);
});

watch([tab, filter, q, groupsFocusTarget], () => {
	syncRoute();
});

definePage(() => ({
	title: i18n.ts._community.messages,
	icon: 'ti ti-messages',
}));
</script>

<style lang="scss" module>
</style>
