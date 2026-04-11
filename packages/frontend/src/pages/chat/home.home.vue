<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<section :class="$style.hero">
		<div :class="$style.heroActions">
			<MkButton
				v-if="$i.policies.chatAvailability === 'available'"
				primary
				gradate
				rounded
				:class="$style.startButton"
				@click="startUser"
			>
				<i class="ti ti-user-plus"></i> {{ i18n.ts._chat.individualChat }}
			</MkButton>

			<MkButton
				v-if="$i.policies.chatAvailability !== 'unavailable' && hasUnreadHistories"
				rounded
				@click="readAllChatMessages"
			>
				<i class="ti ti-checks"></i> {{ i18n.ts.readAllChatMessages }}
			</MkButton>
		</div>

		<MkInfo v-if="$i.policies.chatAvailability !== 'available'">
			{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}
		</MkInfo>

		<MkInput
			v-model="searchQuery"
			:ariaLabel="i18n.ts._chat.searchMessages"
			:large="true"
			:placeholder="i18n.ts._chat.searchMessages"
			type="search"
			@enter="triggerImmediateSearch"
		>
			<template #prefix><i class="ti ti-search"></i></template>
			<template #suffix>
				<button
					v-if="searchMode"
					type="button"
					class="_button"
					:class="$style.clearSearchButton"
					@click.stop="clearSearch"
				>
					<i class="ti ti-x"></i>
				</button>
			</template>
		</MkInput>
	</section>

	<section v-if="groupInboxCount > 0" :class="$style.groupInboxCard">
		<div :class="$style.groupInboxHeader">
			<div>
				<div :class="$style.groupInboxTitle">群聊待处理</div>
				<div :class="$style.groupInboxMeta">有 {{ groupInboxCount }} 项群聊动态需要查看</div>
			</div>
			<MkButton rounded small @click="emit('openGroups', primaryGroupInboxTarget)">前往群聊</MkButton>
		</div>

		<div :class="$style.groupInboxChips">
			<button
				v-for="item in groupInboxItems"
				:key="item.target"
				type="button"
				class="_button"
				:class="$style.groupInboxChip"
				@click="emit('openGroups', item.target)"
			>
				<span>{{ item.label }}</span>
				<span :class="$style.groupInboxBadge">{{ item.count }}</span>
			</button>
		</div>
	</section>

	<div v-if="!searchMode" :class="$style.filters" role="toolbar" :aria-label="i18n.ts.filter">
		<button
			v-for="item in filterItems"
			:key="item.value"
			type="button"
			class="_button"
			:class="[$style.filterChip, currentFilter === item.value ? $style.filterChipActive : null]"
			:aria-pressed="currentFilter === item.value"
			@click="currentFilter = item.value"
		>
			<span>{{ item.label }}</span>
			<span :class="[$style.filterBadge, currentFilter === item.value ? $style.filterBadgeActive : null]">{{ historyStats[item.value] }}</span>
		</button>
	</div>

	<MkFoldableSection v-if="searchMode" persistKey="chat-home-search-results">
		<template #header>{{ i18n.ts.searchResult }}</template>

		<div class="_gaps_s">
			<div v-if="searching">
				<MkLoading/>
			</div>
			<template v-else>
				<section class="_gaps_s">
					<div :class="$style.searchSectionHeader">
						<span>{{ i18n.ts._chat.messages }}</span>
						<span :class="$style.searchSectionMeta">{{ searchResults.length }}</span>
					</div>
					<div v-if="searchResults.length > 0" class="_gaps_s">
						<div v-for="message in searchResults" :key="message.id" :class="$style.searchResultItem">
							<XMessage :message="message" :isSearchResult="true"/>
						</div>
					</div>
					<MkResult v-else type="empty" text="没有找到相关消息"/>
				</section>

				<section class="_gaps_s">
					<div :class="$style.searchSectionHeader">
						<span>{{ i18n.ts._chat.roomChat }}</span>
						<span :class="$style.searchSectionMeta">{{ groupSearchResults.length }}</span>
					</div>
					<div v-if="groupSearchResults.length > 0" class="_gaps_s">
						<XRoom v-for="room in groupSearchResults" :key="room.id" :room="room"/>
					</div>
					<MkResult v-else type="empty" text="没有找到相关群聊"/>
				</section>

				<MkResult v-if="searchResults.length === 0 && groupSearchResults.length === 0" type="empty" text="没有找到相关内容">
					<MkButton rounded @click="clearSearch">{{ i18n.ts.clear }}</MkButton>
				</MkResult>
			</template>
		</div>
	</MkFoldableSection>

	<MkFoldableSection v-else persistKey="chat-home-history">
		<template #header>{{ i18n.ts._chat.history }}</template>

		<MkChatHistories
			:filter="currentFilter"
			:emptyActionLabel="$i.policies.chatAvailability === 'available' ? i18n.ts._chat.individualChat : undefined"
			:emptyDescription="i18n.ts._chat.noMessagesYet"
			@stats="onHistoryStats"
			@emptyAction="startUser"
		/>
	</MkFoldableSection>

	<MkAd :preferForms="['horizontal', 'horizontal-big']"/>
</div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import XRoom from './XRoom.vue';
import type { ChatConversationFilter, ChatHistoryStats } from './history-items.js';
import { emitChatHomeInvalidated } from './state.js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { ensureSignin } from '@/i.js';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import MkInput from '@/components/MkInput.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkChatHistories from '@/components/MkChatHistories.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkResult from '@/components/global/MkResult.vue';
import { useGlobalEvent } from '@/events.js';

const $i = ensureSignin();

const router = useRouter();

type ChatSummary = {
	invitations: number;
	myRequests: number;
	joiningRooms: number;
	ownedRooms: number;
	pendingRequests: number;
	unreadConversations: number;
	unreadDirectConversations: number;
	unreadGroupConversations: number;
};

const props = withDefaults(defineProps<{
	filter?: ChatConversationFilter;
	query?: string;
}>(), {
	filter: 'all',
	query: '',
});

const emit = defineEmits<{
	(ev: 'openGroups', target: 'invitations' | 'requests' | 'approvals'): void;
	(ev: 'update:filter', value: ChatConversationFilter): void;
	(ev: 'update:query', value: string): void;
}>();

const searchQuery = ref(props.query);
const searching = ref(false);
const searchResults = ref<Misskey.entities.ChatMessage[]>([]);
const groupSearchResults = ref<Misskey.entities.ChatRoom[]>([]);
const currentFilter = ref<ChatConversationFilter>(props.filter);
const summary = ref<ChatSummary>({
	invitations: 0,
	myRequests: 0,
	joiningRooms: 0,
	ownedRooms: 0,
	pendingRequests: 0,
	unreadConversations: 0,
	unreadDirectConversations: 0,
	unreadGroupConversations: 0,
});
const historyStats = ref<ChatHistoryStats>({
	all: 0,
	unread: 0,
	direct: 0,
	group: 0,
});
const searchMode = computed(() => searchQuery.value.trim().length > 0);
const hasUnreadHistories = computed(() => historyStats.value.unread > 0 || summary.value.unreadConversations > 0);
const groupInboxItems = computed(() => [{
	label: i18n.ts._chat.invitations,
	count: summary.value.invitations,
	target: 'invitations' as const,
}, {
	label: '我的申请',
	count: summary.value.myRequests,
	target: 'requests' as const,
}, {
	label: '待审批',
	count: summary.value.pendingRequests,
	target: 'approvals' as const,
}].filter(item => item.count > 0));
const groupInboxCount = computed(() => groupInboxItems.value.reduce((total, item) => total + item.count, 0));
const primaryGroupInboxTarget = computed(() => groupInboxItems.value[0]?.target ?? 'invitations');

const filterItems: { value: ChatConversationFilter; label: string }[] = [{
	value: 'all',
	label: i18n.ts.all,
}, {
	value: 'unread',
	label: i18n.ts.unread,
}, {
	value: 'direct',
	label: i18n.ts._chat.individualChat,
}, {
	value: 'group',
	label: i18n.ts._chat.roomChat,
}];

let searchTimer: number | null = null;
let searchSerial = 0;

async function startUser() {
	// TODO: localOnly は連合に対応したら消す
	os.selectUser({ localOnly: true }).then(user => {
		router.push('/chat/user/:userId', {
			params: {
				userId: user.id,
			},
		});
	});
}

function roomMatchesQuery(room: Misskey.entities.ChatRoom, query: string) {
	const normalized = query.trim().toLowerCase();
	if (normalized === '') return true;

	return room.name.toLowerCase().includes(normalized) || room.description.toLowerCase().includes(normalized);
}

async function fetchSummary() {
	summary.value = await misskeyApi<ChatSummary>('chat/summary' as never, {} as never);
}

function clearSearchState() {
	searching.value = false;
	searchResults.value = [];
	groupSearchResults.value = [];
	searchSerial += 1;
}

function clearSearch() {
	searchQuery.value = '';
}

async function runSearch(rawQuery = searchQuery.value) {
	const query = rawQuery.trim();
	if (query.length === 0) {
		clearSearchState();
		return;
	}

	const serial = ++searchSerial;
	searching.value = true;

	try {
		const [messages, discoverRooms, ownedRooms, joiningRooms] = await Promise.all([
			misskeyApi('chat/messages/search', {
				query,
				limit: 20,
			}),
			misskeyApi<Misskey.entities.ChatRoom[]>('chat/rooms/discover' as never, {
				query,
				limit: 12,
			} as never),
			misskeyApi('chat/rooms/owned', { limit: 50 }),
			misskeyApi('chat/rooms/joining', { limit: 50 }),
		]);

		if (serial !== searchSerial) return;

		const roomMap = new Map<string, Misskey.entities.ChatRoom>();
		for (const ownedRoom of ownedRooms.filter(item => roomMatchesQuery(item, query))) {
			roomMap.set(ownedRoom.id, ownedRoom);
		}
		for (const membership of joiningRooms) {
			if (membership.room == null || !roomMatchesQuery(membership.room, query)) continue;
			roomMap.set(membership.room.id, membership.room);
		}
		for (const room of discoverRooms) {
			roomMap.set(room.id, room);
		}

		searchResults.value = messages;
		groupSearchResults.value = [...roomMap.values()].toSorted((a, b) => {
			const aPriority = a.isJoined ? 0 : a.invitationExists ? 1 : 2;
			const bPriority = b.isJoined ? 0 : b.invitationExists ? 1 : 2;
			if (aPriority !== bPriority) return aPriority - bPriority;
			return b.memberCount - a.memberCount;
		});
	} finally {
		if (serial === searchSerial) {
			searching.value = false;
		}
	}
}

function scheduleSearch() {
	if (searchTimer != null) {
		window.clearTimeout(searchTimer);
	}

	if (!searchMode.value) {
		clearSearchState();
		return;
	}

	searchTimer = window.setTimeout(() => {
		searchTimer = null;
		void runSearch();
	}, 280);
}

function triggerImmediateSearch() {
	if (searchTimer != null) {
		window.clearTimeout(searchTimer);
		searchTimer = null;
	}

	void runSearch();
}

async function readAllChatMessages() {
	await os.apiWithDialog('chat/read-all', {});
	updateCurrentAccountPartial({ hasUnreadChatMessages: false });
	emitChatHomeInvalidated({
		reason: 'chat-read-all-from-home',
	});
	await fetchSummary();
}

function onHistoryStats(stats: ChatHistoryStats) {
	historyStats.value = stats;
}

onMounted(() => {
	updateCurrentAccountPartial({ hasUnreadChatMessages: false });
	void fetchSummary();
	if (searchMode.value) {
		void runSearch(searchQuery.value);
	}
});

onActivated(() => {
	void fetchSummary();
	if (searchMode.value) {
		void runSearch(searchQuery.value);
	}
});

onBeforeUnmount(() => {
	if (searchTimer != null) {
		window.clearTimeout(searchTimer);
	}
});

useGlobalEvent('chatHomeInvalidated', () => {
	void fetchSummary();
	if (searchMode.value) {
		void runSearch(searchQuery.value);
	}
});

watch(() => props.filter, (value) => {
	if (value === currentFilter.value) return;
	currentFilter.value = value;
});

watch(() => props.query, (value) => {
	const nextValue = value ?? '';
	if (nextValue === searchQuery.value) return;
	searchQuery.value = nextValue;
	if (nextValue.trim().length === 0) {
		clearSearchState();
	} else {
		void runSearch(nextValue);
	}
});

watch(currentFilter, (value) => {
	emit('update:filter', value);
});

watch(searchQuery, (value) => {
	emit('update:query', value);
	scheduleSearch();
});
</script>

<style lang="scss" module>
.hero {
	display: grid;
	gap: 14px;
}

.heroActions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 10px;
}

.startButton {
	margin: 0 auto;
	width: min(100%, 320px);
	min-width: min(100%, 220px);
}

.clearSearchButton {
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	border-radius: 999px;
	color: color-mix(in srgb, var(--MI_THEME-fg) 66%, transparent);
	transition: background 0.18s ease, color 0.18s ease;

	&:hover {
		color: var(--MI_THEME-fg);
		background: color-mix(in srgb, var(--MI_THEME-bg) 70%, var(--MI_THEME-panel) 30%);
	}
}

.groupInboxCard {
	padding: 16px;
	border-radius: 18px;
	background:
		radial-gradient(circle at top right, color(from var(--MI_THEME-accent) srgb r g b / 0.10), transparent 42%),
		color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-bg) 8%);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 78%, transparent);
}

.groupInboxHeader {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.groupInboxTitle {
	font-size: 0.98rem;
	font-weight: 700;
}

.groupInboxMeta {
	margin-top: 4px;
	font-size: 0.86rem;
	color: color-mix(in srgb, var(--MI_THEME-fg) 68%, transparent);
}

.groupInboxChips {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 14px;
}

.groupInboxChip {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	border-radius: 999px;
	font-size: 0.88rem;
	background: color-mix(in srgb, var(--MI_THEME-bg) 78%, var(--MI_THEME-panel) 22%);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 72%, transparent);
	transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;

	&:hover {
		color: var(--MI_THEME-accent);
		background: color(from var(--MI_THEME-accent) srgb r g b / 0.10);
		border-color: color(from var(--MI_THEME-accent) srgb r g b / 0.28);
	}
}

.groupInboxBadge {
	min-width: 22px;
	padding: 2px 7px;
	border-radius: 999px;
	font-size: 0.78rem;
	line-height: 1.2;
	text-align: center;
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.12);
	border: 1px solid color(from var(--MI_THEME-accent) srgb r g b / 0.24);
}

.filters {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.filterChip {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 8px 14px;
	border-radius: 999px;
	font-size: 0.9rem;
	background: color-mix(in srgb, var(--MI_THEME-bg) 82%, var(--MI_THEME-panel) 18%);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 78%, transparent);
	transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.filterChipActive {
	color: var(--MI_THEME-accent);
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.12);
	border-color: color(from var(--MI_THEME-accent) srgb r g b / 0.32);
}

.filterBadge {
	min-width: 22px;
	padding: 2px 7px;
	border-radius: 999px;
	font-size: 0.78rem;
	line-height: 1.2;
	text-align: center;
	background: color-mix(in srgb, var(--MI_THEME-bg) 72%, var(--MI_THEME-panel) 28%);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 72%, transparent);
}

.filterBadgeActive {
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.14);
	border-color: color(from var(--MI_THEME-accent) srgb r g b / 0.28);
}

.searchSectionHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	font-size: 0.95rem;
	font-weight: 700;
}

.searchSectionMeta {
	font-size: 0.82rem;
	color: color-mix(in srgb, var(--MI_THEME-fg) 62%, transparent);
}

.searchResultItem {
	padding: 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 12px;
}

@container (max-width: 720px) {
	.heroActions {
		flex-direction: column;
		align-items: stretch;
	}

	.startButton {
		width: 100%;
	}
}

@container (max-width: 600px) {
	.groupInboxHeader {
		flex-direction: column;
		align-items: stretch;
	}

	.filters {
		flex-wrap: nowrap;
		overflow-x: auto;
		padding-bottom: 4px;
		scrollbar-width: thin;
	}
}
</style>
