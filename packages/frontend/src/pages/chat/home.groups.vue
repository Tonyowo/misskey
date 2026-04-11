<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div class="_buttons">
		<MkButton primary rounded @click="createRoom"><i class="ti ti-plus"></i> 创建群聊</MkButton>
		<MkButton rounded @click="toggleDiscover"><i class="ti ti-compass"></i> 发现群聊</MkButton>
		<MkButton rounded @click="joinByLink"><i class="ti ti-link"></i> 通过链接加入</MkButton>
	</div>

	<section v-if="showDiscover" class="_gaps_s">
		<h2 :class="$style.sectionTitle">发现群聊</h2>
		<MkInfo>这里会展示公开可发现的群聊，你可以进入群页后直接加入或提交申请。</MkInfo>
		<div v-if="discoverRooms.length > 0" class="_gaps_s">
			<XRoom v-for="room in discoverRooms" :key="room.id" :room="room"/>
		</div>
		<MkResult v-else-if="!discoverFetching" type="empty" text="暂无可发现的公开群聊"/>
		<MkLoading v-if="discoverFetching"/>
	</section>

	<div :class="$style.summaryGrid">
		<button class="_button" :class="$style.summaryCard" @click="focusSection('invitations')">
			<div :class="$style.summaryLabel">邀请</div>
			<div :class="$style.summaryValue">{{ summary.invitations }}</div>
		</button>
		<button class="_button" :class="$style.summaryCard" @click="focusSection('requests')">
			<div :class="$style.summaryLabel">我的申请</div>
			<div :class="$style.summaryValue">{{ summary.myRequests }}</div>
		</button>
		<button class="_button" :class="$style.summaryCard" @click="focusSection('approvals')">
			<div :class="$style.summaryLabel">待审批</div>
			<div :class="$style.summaryValue">{{ summary.pendingRequests }}</div>
		</button>
	</div>

	<MkInfo v-if="summary.pendingRequests > 0" :class="$style.pendingInfo">
		你管理的群聊还有 {{ summary.pendingRequests }} 条待审批申请，请到对应群聊的成员页处理。
	</MkInfo>

	<section v-if="invitations.length > 0" ref="invitationSection" class="_gaps_s">
		<h2 :class="$style.sectionTitle">收到的邀请</h2>
		<MkFolder v-for="invitation in invitations" :key="invitation.id" :defaultOpen="false">
			<template #icon><i class="ti ti-users-group"></i></template>
			<template #label>{{ invitation.room.name }}</template>
			<template #suffix><MkTime :time="invitation.createdAt"/></template>
			<template #footer>
				<div class="_buttons">
					<MkButton primary rounded @click="acceptInvitation(invitation)"><i class="ti ti-check"></i> 接受</MkButton>
					<MkButton rounded danger @click="ignoreInvitation(invitation)"><i class="ti ti-x"></i> 忽略</MkButton>
				</div>
			</template>

			<div class="_gaps_s">
				<div>{{ invitation.room.description === '' ? i18n.ts.noDescription : invitation.room.description }}</div>
			</div>
		</MkFolder>
	</section>

	<section v-if="requests.length > 0" ref="requestSection" class="_gaps_s">
		<h2 :class="$style.sectionTitle">我的申请</h2>
		<div v-for="request in requests" :key="request.id" class="_gaps_s">
			<XRoom :room="request.room"/>
			<MkInfo v-if="request.message">{{ request.message }}</MkInfo>
		</div>
	</section>

	<section class="_gaps_s">
		<h2 :class="$style.sectionTitle">我的群聊</h2>

		<div :class="$style.filters">
			<button
				v-for="item in filterItems"
				:key="item.value"
				class="_button"
				:class="[$style.filterChip, roomFilter === item.value ? $style.filterChipActive : null]"
				@click="roomFilter = item.value"
			>
				{{ item.label }}
			</button>
		</div>

		<div v-if="filteredRooms.length > 0" class="_gaps_s">
			<XRoom v-for="room in filteredRooms" :key="room.id" :room="room"/>
		</div>
		<MkResult v-else-if="!fetching" type="empty" text="暂无群聊"/>
		<MkLoading v-if="fetching"/>
	</section>
</div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onMounted, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import XRoom from './XRoom.vue';
import {
	applyChatRoomPatch,
	emitChatHomeInvalidated,
	emitChatRoomCollectionsInvalidated,
	emitChatRoomUpdated,
	removeById,
	shouldRefreshChatCollections,
} from './state.js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkResult from '@/components/global/MkResult.vue';
import MkTime from '@/components/global/MkTime.vue';
import { useGlobalEvent } from '@/events.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import { misskeyApi } from '@/utility/misskey-api.js';

type ChatSummary = {
	invitations: number;
	myRequests: number;
	joiningRooms: number;
	ownedRooms: number;
	pendingRequests: number;
	unreadConversations: number;
};

type GroupFilter = 'all' | 'owned' | 'managed' | 'joined';

const router = useRouter();

const fetching = ref(true);
const summary = ref<ChatSummary>({
	invitations: 0,
	myRequests: 0,
	joiningRooms: 0,
	ownedRooms: 0,
	pendingRequests: 0,
	unreadConversations: 0,
});
const roomFilter = ref<GroupFilter>('all');
const showDiscover = ref(false);
const ownedRooms = ref<Misskey.entities.ChatRoom[]>([]);
const joiningMemberships = ref<Misskey.entities.ChatRoomMembership[]>([]);
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);
const requests = ref<Misskey.entities.ChatRoomJoinRequest[]>([]);
const discoverRooms = ref<Misskey.entities.ChatRoom[]>([]);
const discoverFetching = ref(false);
const invitationSection = useTemplateRef('invitationSection');
const requestSection = useTemplateRef('requestSection');

const filterItems: { value: GroupFilter; label: string }[] = [{
	value: 'all',
	label: '全部',
}, {
	value: 'owned',
	label: '我创建的',
}, {
	value: 'managed',
	label: '我管理的',
}, {
	value: 'joined',
	label: '已加入',
}];

const allRooms = computed(() => {
	const roomMap = new Map<string, Misskey.entities.ChatRoom>();

	for (const room of ownedRooms.value) {
		roomMap.set(room.id, room);
	}

	for (const membership of joiningMemberships.value) {
		if (membership.room == null) continue;
		if (!roomMap.has(membership.room.id)) {
			roomMap.set(membership.room.id, membership.room);
		}
	}

	return [...roomMap.values()].sort((a, b) => {
		const aRolePriority = a.myRole === 'owner' ? 0 : a.myRole === 'admin' ? 1 : 2;
		const bRolePriority = b.myRole === 'owner' ? 0 : b.myRole === 'admin' ? 1 : 2;
		return aRolePriority - bRolePriority;
	});
});

const filteredRooms = computed(() => {
	switch (roomFilter.value) {
		case 'owned':
			return ownedRooms.value;
		case 'managed':
			return allRooms.value.filter(room => room.myRole === 'owner' || room.myRole === 'admin');
		case 'joined':
			return joiningMemberships.value
				.map(membership => membership.room)
				.filter((room): room is Misskey.entities.ChatRoom => room != null);
		case 'all':
		default:
			return allRooms.value;
	}
});

async function fetchSummary() {
	summary.value = await misskeyApi<ChatSummary>('chat/summary' as never, {} as never);
}

async function fetchDiscoverRooms() {
	discoverFetching.value = true;
	try {
		const rooms = await misskeyApi<Misskey.entities.ChatRoom[]>('chat/rooms/discover' as never, {
			limit: 30,
		} as never);

		discoverRooms.value = rooms.filter(room => !room.isJoined);
	} catch {
		os.alert({
			type: 'error',
			title: '发现群聊',
			text: '公开群列表加载失败，请稍后再试。',
		});
	} finally {
		discoverFetching.value = false;
	}
}

async function fetchAll() {
	fetching.value = true;

	const [summaryResult, ownedResult, joiningResult, invitationResult, requestResult] = await Promise.all([
		misskeyApi<ChatSummary>('chat/summary' as never, {} as never),
		misskeyApi('chat/rooms/owned', { limit: 100 }),
		misskeyApi('chat/rooms/joining', { limit: 100 }),
		misskeyApi('chat/rooms/invitations/inbox', { limit: 20 }),
		misskeyApi('chat/rooms/requests/mine', { limit: 20 }),
	]);

	summary.value = summaryResult;
	ownedRooms.value = ownedResult;
	joiningMemberships.value = joiningResult;
	invitations.value = invitationResult;
	requests.value = requestResult;

	fetching.value = false;
}

function focusSection(target: 'invitations' | 'requests' | 'approvals') {
	if (target === 'invitations') {
		invitationSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		return;
	}

	if (target === 'requests') {
		requestSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		return;
	}

	os.alert({
		title: '待审批申请',
		text: '请进入你创建或管理的群聊，在成员页中处理入群申请。',
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

async function toggleDiscover() {
	showDiscover.value = !showDiscover.value;
	if (showDiscover.value && discoverRooms.value.length === 0) {
		await fetchDiscoverRooms();
	}
}

async function joinByLink() {
	const { canceled, result } = await os.inputText({
		title: '通过链接加入',
		text: '请粘贴完整的群邀请链接',
	});
	if (canceled || !result) return;

	try {
		const parsed = new URL(result, url);
		const roomMatch = parsed.pathname.match(/\/chat\/room\/([^/]+)/);
		const inviteCode = parsed.searchParams.get('inviteCode');

		if (roomMatch?.[1] == null || inviteCode == null) {
			throw new Error('invalid invite link');
		}

		router.push('/chat/room/:roomId', {
			params: {
				roomId: roomMatch[1],
			},
			query: {
				inviteCode,
			},
		});
	} catch {
		os.alert({
			type: 'error',
			title: '通过链接加入',
			text: '链接无效，请粘贴完整的群邀请链接。',
		});
	}
}

async function acceptInvitation(invitation: Misskey.entities.ChatRoomInvitation) {
	await misskeyApi('chat/rooms/join', {
		roomId: invitation.room.id,
	});

	invitations.value = removeById(invitations.value, invitation.id);
	emitChatRoomUpdated(invitation.room.id, {
		isJoined: true,
		invitationExists: false,
		joinRequestExists: false,
		memberCount: invitation.room.memberCount + 1,
	});
	emitChatRoomCollectionsInvalidated(invitation.room.id, ['myInvitations', 'joiningRooms']);
	emitChatHomeInvalidated({
		reason: 'room-joined-from-groups',
		roomId: invitation.room.id,
		scopes: ['myInvitations', 'joiningRooms', 'counts'],
	});

	await fetchAll();
}

async function ignoreInvitation(invitation: Misskey.entities.ChatRoomInvitation) {
	await misskeyApi('chat/rooms/invitations/ignore', {
		roomId: invitation.room.id,
	});

	invitations.value = removeById(invitations.value, invitation.id);
	emitChatRoomUpdated(invitation.room.id, {
		invitationExists: false,
	});
	emitChatRoomCollectionsInvalidated(invitation.room.id, ['myInvitations']);
	emitChatHomeInvalidated({
		reason: 'room-invitation-ignored-from-groups',
		roomId: invitation.room.id,
		scopes: ['myInvitations', 'counts'],
	});

	await fetchSummary();
}

onMounted(() => {
	void fetchAll();
});

onActivated(() => {
	void fetchAll();
});

useGlobalEvent('chatHomeInvalidated', () => {
	void fetchAll();
});

useGlobalEvent('chatRoomUpdated', ({ roomId, patch }) => {
	ownedRooms.value = ownedRooms.value.map(room => room.id === roomId ? {
		...room,
		...patch,
	} : room);
	discoverRooms.value = discoverRooms.value.map(room => room.id === roomId ? {
		...room,
		...patch,
	} : room);
	joiningMemberships.value = joiningMemberships.value.map(membership => applyChatRoomPatch(membership, {
		roomId,
		patch,
	}));
	invitations.value = invitations.value.map(invitation => applyChatRoomPatch(invitation, {
		roomId,
		patch,
	}));
	requests.value = requests.value.map(request => applyChatRoomPatch(request, {
		roomId,
		patch,
	}));
});

useGlobalEvent('chatRoomCollectionsInvalidated', (payload) => {
	if (!shouldRefreshChatCollections(payload, ['joiningRooms', 'ownedRooms', 'myInvitations', 'myRequests', 'counts'])) return;
	void fetchAll();
	if (showDiscover.value) {
		void fetchDiscoverRooms();
	}
});
</script>

<style lang="scss" module>
.summaryGrid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 12px;
}

@container (max-width: 600px) {
	.summaryGrid {
		grid-template-columns: 1fr;
	}
}

.summaryCard {
	padding: 16px;
	border-radius: 18px;
	text-align: left;
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-bg) 8%);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 78%, transparent);
}

.summaryLabel {
	font-size: 0.9rem;
	color: color-mix(in srgb, var(--MI_THEME-fg) 72%, transparent);
}

.summaryValue {
	margin-top: 8px;
	font-size: 1.45rem;
	font-weight: 700;
}

.pendingInfo {
	margin-top: -4px;
}

.sectionTitle {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.filters {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.filterChip {
	padding: 8px 14px;
	border-radius: 999px;
	font-size: 0.9rem;
	background: color-mix(in srgb, var(--MI_THEME-bg) 82%, var(--MI_THEME-panel) 18%);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 78%, transparent);
}

.filterChipActive {
	color: var(--MI_THEME-accent);
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.12);
	border-color: color(from var(--MI_THEME-accent) srgb r g b / 0.32);
}
</style>
