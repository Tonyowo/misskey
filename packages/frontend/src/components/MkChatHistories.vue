<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="filteredHistory.length > 0" class="_gaps_s">
	<MkA
		v-for="item in filteredHistory"
		:key="item.id"
		:class="[$style.message, { [$style.isMe]: item.isMe, [$style.isRead]: item.message.isRead, [$style.isUnread]: item.isUnread }]"
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
						<span :class="$style.badge">
							<i class="ti ti-users"></i>
							{{ item.message.toRoom.memberCount }}
						</span>
						<span v-if="item.isUnread" :class="[$style.badge, $style.badgeUnread]">{{ i18n.ts.unread }}</span>
						<span v-if="item.message.toRoom.isMuted" :class="$style.badge" :title="i18n.ts._chat.muteThisRoom">
							<i class="ti ti-bell-off"></i>
						</span>
						<span v-if="(item.message.toRoom.pendingRequestCount ?? 0) > 0" :class="[$style.badge, $style.badgeWarn]">
							<i class="ti ti-shield-check"></i>
							{{ item.message.toRoom.pendingRequestCount }}
						</span>
					</div>
				</div>
				<div :class="$style.messageHeaderAside">
					<MkTime :time="item.message.createdAt" :class="$style.messageHeaderTime"/>
					<MkButton
						v-if="showActions"
						iconOnly
						small
						rounded
						transparent
						:class="$style.messageMenuButton"
						@click.stop.prevent="showItemMenu($event, item)"
					><i class="ti ti-dots"></i></MkButton>
				</div>
			</header>
			<header v-else :class="$style.messageHeader">
				<div :class="$style.messageHeaderMain">
					<MkUserName :class="$style.messageHeaderName" :user="item.other!"/>
					<MkAcct :class="$style.messageHeaderUsername" :user="item.other!"/>
					<span v-if="item.isUnread" :class="[$style.badge, $style.badgeUnread]">{{ i18n.ts.unread }}</span>
				</div>
				<div :class="$style.messageHeaderAside">
					<MkTime :time="item.message.createdAt" :class="$style.messageHeaderTime"/>
					<MkButton
						v-if="showActions"
						iconOnly
						small
						rounded
						transparent
						:class="$style.messageMenuButton"
						@click.stop.prevent="showItemMenu($event, item)"
					><i class="ti ti-dots"></i></MkButton>
				</div>
			</header>
			<div v-if="shouldShowChatHistorySenderSubline(item.message)" :class="$style.messageSubline">
				{{ item.message.fromUser.name ?? item.message.fromUser.username }}
			</div>
			<div :class="$style.messageBodyText">
				<span v-if="item.isMe && !isSystemChatMessage(item.message)" :class="$style.youSaid">{{ i18n.ts.you }}:</span>
				{{ formatChatMessagePreviewText(item.message) }}
			</div>
		</div>
	</MkA>
</div>
<MkResult v-if="!initializing && filteredHistory.length == 0" type="empty" :text="i18n.ts._chat.noHistory">
	<div v-if="emptyDescription" :class="$style.emptyDescription">{{ emptyDescription }}</div>
	<MkButton v-if="emptyActionLabel" rounded @click="emit('emptyAction')">{{ emptyActionLabel }}</MkButton>
</MkResult>
<MkLoading v-if="initializing"/>
</template>

<script lang="ts" setup>
import { onActivated, onDeactivated, onMounted, ref, watch } from 'vue';
import { useInterval } from '@@/js/use-interval.js';
import type { ChatConversationFilter, ChatHistoryItem, ChatHistoryStats } from '@/pages/chat/history-items.js';
import { filterChatHistoryItems, getChatHistoryStats } from '@/pages/chat/history-items.js';
import { emitChatHomeInvalidated, emitChatRoomUpdated } from '@/pages/chat/state.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { formatChatMessagePreviewText, isSystemChatMessage, shouldShowChatHistorySenderSubline } from '@/utility/chat-system-event-text.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { useGlobalEvent } from '@/events.js';
import * as os from '@/os.js';
import MkButton from '@/components/MkButton.vue';
import { useRouter } from '@/router.js';
import { updateCurrentAccountPartial } from '@/accounts.js';

const $i = ensureSignin();
const router = useRouter();

type ChatHistoryViewItem = ChatHistoryItem & {
	isUnread: boolean;
};

const props = withDefaults(defineProps<{
	filter?: ChatConversationFilter;
	showActions?: boolean;
	emptyActionLabel?: string;
	emptyDescription?: string;
}>(), {
	filter: 'all',
	showActions: true,
	emptyActionLabel: undefined,
	emptyDescription: undefined,
});

const emit = defineEmits<{
	(ev: 'stats', stats: ChatHistoryStats): void;
	(ev: 'emptyAction'): void;
	(ev: 'action', payload: {
		type: 'readAll' | 'muteRoom' | 'unmuteRoom' | 'open';
		item: ChatHistoryItem;
	}): void;
}>();

const conversationItems = ref<ChatHistoryItem[]>([]);
const filteredHistory = ref<ChatHistoryViewItem[]>([]);

const initializing = ref(true);
const fetching = ref(false);

function decorateItem(item: ChatHistoryItem): ChatHistoryViewItem {
	return {
		...item,
		isUnread: !item.isMe && item.message.isRead !== true,
	};
}

function applyFilter() {
	filteredHistory.value = filterChatHistoryItems(conversationItems.value, props.filter).map(decorateItem);
	emit('stats', getChatHistoryStats(conversationItems.value));
}

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
	applyFilter();

	fetching.value = false;
	initializing.value = false;
}

async function readAllFromMenu(item: ChatHistoryItem) {
	await os.apiWithDialog('chat/read-all', {});
	updateCurrentAccountPartial({ hasUnreadChatMessages: false });
	conversationItems.value = conversationItems.value.map(historyItem => ({
		...historyItem,
		message: {
			...historyItem.message,
			isRead: true,
		},
	}));
	applyFilter();
	emitChatHomeInvalidated({
		reason: 'chat-read-all-from-history-item',
	});
	emit('action', {
		type: 'readAll',
		item,
	});
}

async function toggleRoomMute(item: ChatHistoryItem) {
	if (item.message.toRoomId == null || item.message.toRoom == null) return;

	const mute = !(item.message.toRoom.isMuted ?? false);
	await os.apiWithDialog('chat/rooms/mute', {
		roomId: item.message.toRoomId,
		mute,
	});

	conversationItems.value = conversationItems.value.map(historyItem => historyItem.message.toRoomId === item.message.toRoomId ? {
		...historyItem,
		message: {
			...historyItem.message,
			toRoom: historyItem.message.toRoom ? {
				...historyItem.message.toRoom,
				isMuted: mute,
			} : historyItem.message.toRoom,
		},
	} : historyItem);
	applyFilter();
	emitChatRoomUpdated(item.message.toRoomId, {
		isMuted: mute,
	});
	emitChatHomeInvalidated({
		reason: mute ? 'chat-room-muted-from-history-item' : 'chat-room-unmuted-from-history-item',
		roomId: item.message.toRoomId,
	});
	emit('action', {
		type: mute ? 'muteRoom' : 'unmuteRoom',
		item,
	});
}

function showItemMenu(ev: MouseEvent, item: ChatHistoryItem) {
	const menu = [{
			text: i18n.ts.details,
			icon: 'ti ti-arrow-right',
			action: () => {
				if (item.message.toRoomId) {
					router.push('/chat/room/:roomId', {
						params: {
							roomId: item.message.toRoomId,
						},
					});
				} else if (item.other) {
					router.push('/chat/user/:userId', {
						params: {
							userId: item.other.id,
						},
					});
				}
				emit('action', {
					type: 'open',
					item,
				});
			},
		}];

	if (item.isMe === false && item.message.isRead !== true) {
		menu.push({
			text: i18n.ts.readAllChatMessages,
			icon: 'ti ti-checks',
			action: () => { void readAllFromMenu(item); },
		});
	}

	if (item.message.toRoomId != null && item.message.toRoom != null) {
		menu.push({
			text: item.message.toRoom.isMuted ? i18n.tsx.unmuteX({ x: item.message.toRoom.name }) : i18n.tsx.muteX({ x: item.message.toRoom.name }),
			icon: item.message.toRoom.isMuted ? 'ti ti-bell' : 'ti ti-bell-off',
			action: () => { void toggleRoomMute(item); },
		});
	}

	os.popupMenu(menu, ev.currentTarget ?? ev.target);
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
	align-items: flex-start;
	gap: 16px;
	padding: 16px 18px;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 72%, transparent);
	transition: border-color 0.18s ease, background 0.18s ease;
	content-visibility: auto;
	contain-intrinsic-size: 92px;

	&:hover {
		text-decoration: none;
		border-color: color(from var(--MI_THEME-accent) srgb r g b / 0.22);
		background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-bg) 8%);
	}

	&.isUnread {
		background:
			linear-gradient(90deg, color(from var(--MI_THEME-accent) srgb r g b / 0.08), transparent 22%),
			color-mix(in srgb, var(--MI_THEME-panel) 94%, var(--MI_THEME-bg) 6%);
		border-color: color(from var(--MI_THEME-accent) srgb r g b / 0.28);
		box-shadow: 0 10px 24px color(from var(--MI_THEME-shadow) srgb r g b / 0.08);
	}

	&.isRead,
	&.isMe {
		background: color-mix(in srgb, var(--MI_THEME-panel) 96%, var(--MI_THEME-bg) 4%);
	}
}

@container (max-width: 500px) {
	.message {
		gap: 12px;
		padding: 14px 14px;
	}
}

.messageAvatar {
	width: 48px;
	height: 48px;
	flex-shrink: 0;
}

.roomAvatar {
	width: 48px;
	height: 48px;
	flex-shrink: 0;
	border-radius: 999px;
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
	.messageAvatar,
	.roomAvatar {
		width: 42px;
		height: 42px;
	}
}

.messageBody {
	flex: 1;
	min-width: 0;
}

.messageHeader {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	margin-bottom: 4px;
}

.messageHeaderMain {
	min-width: 0;
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
	flex: 1;
}

.messageHeaderAside {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	margin-left: auto;
	flex-shrink: 0;
}

.messageHeaderName {
	margin: 0;
	padding: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	font-size: 1em;
	font-weight: 700;
}

.messageHeaderUsername {
	margin: 0;
}

.messageMenuButton {
	color: color-mix(in srgb, var(--MI_THEME-fg) 66%, transparent);
}

.messageSubline {
	font-size: 0.85rem;
	color: color-mix(in srgb, var(--MI_THEME-fg) 66%, transparent);
	margin-bottom: 4px;
}

.messageBodyText {
	overflow: hidden;
	overflow-wrap: break-word;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	line-height: 1.5;
	font-size: 0.98rem;
	color: color-mix(in srgb, var(--MI_THEME-fg) 90%, transparent);
}

.youSaid {
	font-weight: 700;
	margin-right: 0.45em;
}

.badges {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 6px;
}

.badge {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px;
	border-radius: 999px;
	font-size: 0.74rem;
	line-height: 1;
	background: color-mix(in srgb, var(--MI_THEME-bg) 78%, var(--MI_THEME-panel) 22%);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 80%, transparent);
}

.badgeUnread {
	color: var(--MI_THEME-accent);
	border-color: color(from var(--MI_THEME-accent) srgb r g b / 0.26);
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.10);
}

.badgeWarn {
	color: #c43d2f;
}

.emptyDescription {
	max-width: 360px;
	margin: -6px auto 0;
	line-height: 1.5;
	color: color-mix(in srgb, var(--MI_THEME-fg) 74%, transparent);
}
</style>
