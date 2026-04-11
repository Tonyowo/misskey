<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="filteredHistory.length > 0" class="_gaps_s">
	<MkA
		v-for="item in filteredHistory"
		:key="item.id"
		:class="[$style.message, { [$style.isMe]: item.isMe, [$style.isRead]: item.message.isRead }]"
		class="_panel"
		:to="item.message.toRoomId ? `/chat/room/${item.message.toRoomId}` : `/chat/user/${item.other!.id}`"
	>
		<div v-if="item.message.toRoomId" :class="$style.roomAvatar">
			<img v-if="item.message.toRoom?.avatarUrl" :src="item.message.toRoom.avatarUrl" :class="$style.roomAvatarImage" alt="">
			<div v-else :class="$style.roomAvatarFallback">
				<i class="ti ti-users-group"></i>
			</div>
		</div>
		<MkAvatar v-else-if="item.other" :class="$style.messageAvatar" :user="item.other" indicator :preview="false"/>
		<div :class="$style.messageBody">
			<header v-if="item.message.toRoom" :class="$style.messageHeader">
				<div :class="$style.messageHeaderMain">
					<span :class="$style.messageHeaderName"><i class="ti ti-users"></i> {{ item.message.toRoom.name }}</span>
					<div :class="$style.badges">
						<span :class="$style.badge">{{ item.message.toRoom.memberCount }} 人</span>
						<span v-if="item.message.toRoom.myRole === 'owner'" :class="[$style.badge, $style.badgeAccent]">群主</span>
						<span v-else-if="item.message.toRoom.myRole === 'admin'" :class="[$style.badge, $style.badgeAccent]">管理员</span>
						<span v-if="(item.message.toRoom.pendingRequestCount ?? 0) > 0" :class="[$style.badge, $style.badgeWarn]">待处理 {{ item.message.toRoom.pendingRequestCount }}</span>
					</div>
				</div>
				<MkTime :time="item.message.createdAt" :class="$style.messageHeaderTime"/>
			</header>
			<header v-else :class="$style.messageHeader">
				<div :class="$style.messageHeaderMain">
					<MkUserName :class="$style.messageHeaderName" :user="item.other!"/>
					<MkAcct :class="$style.messageHeaderUsername" :user="item.other!"/>
				</div>
				<MkTime :time="item.message.createdAt" :class="$style.messageHeaderTime"/>
			</header>
			<div v-if="item.message.toRoom && item.message.fromUser" :class="$style.messageSubline">
				{{ item.message.fromUser.name ?? item.message.fromUser.username }}
			</div>
			<div :class="$style.messageBodyText"><span v-if="item.isMe && !isSystemChatMessage(item.message)" :class="$style.youSaid">{{ i18n.ts.you }}:</span>{{ formatChatMessagePreviewText(item.message) }}</div>
		</div>
	</MkA>
</div>
<MkResult v-if="!initializing && filteredHistory.length == 0" type="empty" :text="i18n.ts._chat.noHistory"/>
<MkLoading v-if="initializing"/>
</template>

<script lang="ts" setup>
import { onActivated, onDeactivated, onMounted, ref, watch } from 'vue';
import { useInterval } from '@@/js/use-interval.js';
import type { ChatConversationFilter, ChatHistoryItem, ChatHistoryStats } from '@/pages/chat/history-items.js';
import { filterChatHistoryItems, getChatHistoryStats } from '@/pages/chat/history-items.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { formatChatMessagePreviewText, isSystemChatMessage } from '@/utility/chat-system-event-text.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { useGlobalEvent } from '@/events.js';

const $i = ensureSignin();

const props = withDefaults(defineProps<{
	filter?: ChatConversationFilter;
}>(), {
	filter: 'all',
});

const emit = defineEmits<{
	(ev: 'stats', stats: ChatHistoryStats): void;
}>();

const conversationItems = ref<ChatHistoryItem[]>([]);
const filteredHistory = ref<ChatHistoryItem[]>([]);

const initializing = ref(true);
const fetching = ref(false);

async function fetchHistory() {
	if (fetching.value) return;

	fetching.value = true;

	const [userMessages, roomMessages] = await Promise.all([
		misskeyApi('chat/history', { room: false }),
		misskeyApi('chat/history', { room: true }),
	]);

	conversationItems.value = [...userMessages, ...roomMessages]
		.toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
		.map(m => ({
			id: m.id,
			message: m,
			other: (!('room' in m) || m.room == null) ? (m.fromUserId === $i.id ? m.toUser : m.fromUser) : null,
			isMe: m.fromUserId === $i.id,
		}));
	filteredHistory.value = filterChatHistoryItems(conversationItems.value, props.filter);
	emit('stats', getChatHistoryStats(conversationItems.value));

	fetching.value = false;
	initializing.value = false;
}

function applyFilter() {
	filteredHistory.value = filterChatHistoryItems(conversationItems.value, props.filter);
	emit('stats', getChatHistoryStats(conversationItems.value));
}

let isActivated = true;

onActivated(() => {
	isActivated = true;
});

onDeactivated(() => {
	isActivated = false;
});

useInterval(() => {
	// Prefer event-driven refreshes; keep a low-frequency poll as a safety net.
	if (!window.document.hidden && isActivated) {
		void fetchHistory();
	}
}, 1000 * 30, {
	immediate: false,
	afterMounted: true,
});

useGlobalEvent('chatHomeInvalidated', () => {
	void fetchHistory();
});

useGlobalEvent('chatRoomUpdated', ({ roomId, patch }) => {
	conversationItems.value = conversationItems.value.map(item => item.message.toRoomId === roomId ? {
		...item,
		message: {
			...item.message,
			toRoom: item.message.toRoom ? {
				...item.message.toRoom,
				...patch,
			} : item.message.toRoom,
		},
	} : item);
	applyFilter();
});

onActivated(() => {
	void fetchHistory();
});

onMounted(() => {
	void fetchHistory();
});

watch(() => props.filter, () => {
	applyFilter();
});
</script>

<style lang="scss" module>
.message {
	position: relative;
	display: flex;
	padding: 16px 24px;

	&.isRead,
	&.isMe {
		opacity: 0.8;
	}

	&:not(.isMe):not(.isRead) {
		&::before {
			content: '';
			position: absolute;
			top: 8px;
			right: 8px;
			width: 8px;
			height: 8px;
			border-radius: 100%;
			background-color: var(--MI_THEME-accent);
		}
	}
}

@container (max-width: 500px) {
	.message {
		font-size: 90%;
		padding: 14px 20px;
	}
}

@container (max-width: 450px) {
	.message {
		font-size: 80%;
		padding: 12px 16px;
	}
}

.messageAvatar {
	width: 50px;
	height: 50px;
	margin: 0 16px 0 0;
}

.roomAvatar {
	width: 50px;
	height: 50px;
	flex-shrink: 0;
	margin: 0 16px 0 0;
	border-radius: 16px;
	overflow: hidden;
	box-shadow: 0 0 0 2px color(from var(--MI_THEME-panel) srgb r g b / 0.92);
}

.roomAvatarImage,
.roomAvatarFallback {
	width: 100%;
	height: 100%;
}

.roomAvatarImage {
	display: block;
	object-fit: cover;
}

.roomAvatarFallback {
	display: grid;
	place-items: center;
	font-size: 1.25rem;
	color: color-mix(in srgb, var(--MI_THEME-fg) 72%, transparent);
	background:
		radial-gradient(circle at top, color(from var(--MI_THEME-accent) srgb r g b / 0.18), transparent 58%),
		color-mix(in srgb, var(--MI_THEME-panel) 82%, var(--MI_THEME-bg) 18%);
}

@container (max-width: 500px) {
	.messageAvatar {
		width: 45px;
		height: 45px;
	}
}

@container (max-width: 450px) {
	.messageAvatar {
		width: 40px;
		height: 40px;
	}
}

.messageBody {
	flex: 1;
	min-width: 0;
}

.messageHeader {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 2px;
	white-space: nowrap;
	overflow: clip;
}

.messageHeaderMain {
	min-width: 0;
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.messageHeaderName {
	margin: 0;
	padding: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	font-size: 1em;
	font-weight: bold;
}

.messageHeaderUsername {
	margin: 0;
}

.messageHeaderTime {
	margin-left: auto;
	flex-shrink: 0;
}

.messageSubline {
	font-size: 0.85rem;
	color: color-mix(in srgb, var(--MI_THEME-fg) 66%, transparent);
	margin-bottom: 2px;
}

.messageBodyText {
	overflow: hidden;
	overflow-wrap: break-word;
	font-size: 1.1em;
}

.youSaid {
	font-weight: bold;
	margin-right: 0.5em;
}

.badges {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 6px;
}

.badge {
	padding: 4px 8px;
	border-radius: 999px;
	font-size: 0.74rem;
	line-height: 1;
	background: color-mix(in srgb, var(--MI_THEME-bg) 78%, var(--MI_THEME-panel) 22%);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 80%, transparent);
}

.badgeAccent {
	color: var(--MI_THEME-accent);
}

.badgeWarn {
	color: #c43d2f;
}
</style>
