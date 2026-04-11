<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkButton v-if="$i.policies.chatAvailability === 'available'" primary gradate rounded :class="$style.start" @click="start"><i class="ti ti-plus"></i> 开始聊天</MkButton>

	<MkInfo v-else>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>

	<MkAd :preferForms="['horizontal', 'horizontal-big']"/>

	<MkInput
		v-model="searchQuery"
		placeholder="搜索消息"
		type="search"
		@enter="search"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<MkButton v-if="searchQuery.length > 0" primary rounded @click="search">搜索</MkButton>

	<div :class="$style.summaryGrid">
		<button class="_button" :class="$style.summaryCard" @click="emit('openGroups', 'invitations')">
			<div :class="$style.summaryLabel">邀请</div>
			<div :class="$style.summaryValue">{{ summary.invitations }}</div>
		</button>
		<button class="_button" :class="$style.summaryCard" @click="emit('openGroups', 'requests')">
			<div :class="$style.summaryLabel">我的申请</div>
			<div :class="$style.summaryValue">{{ summary.myRequests }}</div>
		</button>
		<button class="_button" :class="$style.summaryCard" @click="emit('openGroups', 'approvals')">
			<div :class="$style.summaryLabel">待审批</div>
			<div :class="$style.summaryValue">{{ summary.pendingRequests }}</div>
		</button>
	</div>

	<div :class="$style.filters">
		<button
			v-for="item in filterItems"
			:key="item.value"
			class="_button"
			:class="[$style.filterChip, currentFilter === item.value ? $style.filterChipActive : null]"
			@click="currentFilter = item.value"
		>
			<span>{{ item.label }}</span>
			<span :class="[$style.filterBadge, currentFilter === item.value ? $style.filterBadgeActive : null]">{{ historyStats[item.value] }}</span>
		</button>
	</div>

	<MkFoldableSection v-if="searched">
		<template #header>搜索结果</template>

		<div class="_gaps_s">
			<div v-if="searching">
				<MkLoading/>
			</div>
			<template v-else>
				<section class="_gaps_s">
					<div :class="$style.searchSectionHeader">
						<span>消息结果</span>
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
						<span>群聊结果</span>
						<span :class="$style.searchSectionMeta">{{ groupSearchResults.length }}</span>
					</div>
					<div v-if="groupSearchResults.length > 0" class="_gaps_s">
						<XRoom v-for="room in groupSearchResults" :key="room.id" :room="room"/>
					</div>
					<MkResult v-else type="empty" text="没有找到相关群聊"/>
				</section>
			</template>
		</div>
	</MkFoldableSection>

	<MkFoldableSection v-if="summary.unreadConversations > 0">
		<template #header>会话状态</template>

		<div :class="$style.overviewGrid">
			<div :class="$style.overviewCard">
				<div :class="$style.overviewLabel">未读私聊</div>
				<div :class="$style.overviewValue">{{ summary.unreadDirectConversations }}</div>
			</div>
			<div :class="$style.overviewCard">
				<div :class="$style.overviewLabel">未读群聊</div>
				<div :class="$style.overviewValue">{{ summary.unreadGroupConversations }}</div>
			</div>
			<div :class="$style.overviewCard">
				<div :class="$style.overviewLabel">全部未读会话</div>
				<div :class="$style.overviewValue">{{ summary.unreadConversations }}</div>
			</div>
		</div>
	</MkFoldableSection>

	<MkFoldableSection>
		<template #header>历史会话</template>

		<MkChatHistories :filter="currentFilter" @stats="onHistoryStats"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { onActivated, onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import XRoom from './XRoom.vue';
import type { ChatConversationFilter, ChatHistoryStats } from './history-items.js';
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

const emit = defineEmits<{
	(ev: 'openGroups', target: 'invitations' | 'requests' | 'approvals'): void;
}>();

const searchQuery = ref('');
const searched = ref(false);
const searching = ref(false);
const searchResults = ref<Misskey.entities.ChatMessage[]>([]);
const groupSearchResults = ref<Misskey.entities.ChatRoom[]>([]);
const currentFilter = ref<ChatConversationFilter>('all');
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

const filterItems: { value: ChatConversationFilter; label: string }[] = [{
	value: 'all',
	label: '全部',
}, {
	value: 'unread',
	label: '未读',
}, {
	value: 'direct',
	label: '私聊',
}, {
	value: 'group',
	label: '群聊',
}];

function start(ev: PointerEvent) {
	os.popupMenu([{
		text: '单人聊天',
		caption: i18n.ts._chat.individualChat_description,
		icon: 'ti ti-user',
		action: () => { startUser(); },
	}, { type: 'divider' }, {
		type: 'parent',
		text: '群聊',
		caption: i18n.ts._chat.roomChat_description,
		icon: 'ti ti-users-group',
		children: [{
			text: '创建群聊',
			icon: 'ti ti-plus',
			action: () => { createRoom(); },
		}],
	}], ev.currentTarget ?? ev.target);
}

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

async function createRoom() {
	const { canceled, result } = await os.inputText({
		title: '群聊名称',
		minLength: 1,
	});
	if (canceled) return;

	const room = await misskeyApi('chat/rooms/create', {
		name: result,
	});

	router.push('/chat/room/:roomId', {
		params: {
			roomId: room.id,
		},
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

async function search() {
	const query = searchQuery.value.trim();
	if (query.length === 0) {
		searched.value = false;
		searchResults.value = [];
		groupSearchResults.value = [];
		return;
	}

	searching.value = true;
	searched.value = true;

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
		searching.value = false;
	}
}

function onHistoryStats(stats: ChatHistoryStats) {
	historyStats.value = stats;
}

onMounted(() => {
	updateCurrentAccountPartial({ hasUnreadChatMessages: false });
	void fetchSummary();
});

onActivated(() => {
	void fetchSummary();
});

useGlobalEvent('chatHomeInvalidated', () => {
	void fetchSummary();
});

watch(searchQuery, (value) => {
	if (value.trim().length === 0) {
		searched.value = false;
		searchResults.value = [];
		groupSearchResults.value = [];
	}
});
</script>

<style lang="scss" module>
.start {
	margin: 0 auto;
}

.filters {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.summaryGrid,
.overviewGrid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 12px;
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

.summaryCard,
.overviewCard {
	padding: 16px;
	border-radius: 18px;
	text-align: left;
	background:
		radial-gradient(circle at top right, color(from var(--MI_THEME-accent) srgb r g b / 0.10), transparent 42%),
		color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-bg) 8%);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 78%, transparent);
}

.summaryLabel,
.overviewLabel {
	font-size: 0.9rem;
	color: color-mix(in srgb, var(--MI_THEME-fg) 72%, transparent);
}

.summaryValue,
.overviewValue {
	margin-top: 8px;
	font-size: 1.45rem;
	font-weight: 700;
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

@container (max-width: 600px) {
	.summaryGrid,
	.overviewGrid {
		grid-template-columns: 1fr;
	}
}
</style>
