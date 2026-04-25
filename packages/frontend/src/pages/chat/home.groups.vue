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

	<div v-if="fetchError" class="_gaps_s">
		<MkInfo warn>群聊信息加载失败，请稍后重试。</MkInfo>
		<div class="_buttons">
			<MkButton rounded @click="fetchAll"><i class="ti ti-refresh"></i> 重试</MkButton>
		</div>
	</div>

	<section v-if="showDiscover" class="_gaps_s">
		<h2 :class="$style.sectionTitle">发现群聊</h2>
		<MkInfo>这里会展示公开可发现的群聊，你可以进入群页后直接加入或提交申请。</MkInfo>
		<div :class="$style.discoverControls">
			<MkInput
				v-model="discoverQuery"
				placeholder="搜索群名或简介"
				type="search"
				@enter="searchDiscover"
			>
				<template #prefix><i class="ti ti-search"></i></template>
			</MkInput>
			<div class="_buttons">
				<MkButton rounded @click="searchDiscover"><i class="ti ti-search"></i> 搜索</MkButton>
				<MkButton rounded @click="refreshDiscover"><i class="ti ti-refresh"></i> 刷新</MkButton>
			</div>
		</div>
		<div v-if="discoverRooms.length > 0" class="_gaps_s">
			<XRoom v-for="room in discoverRooms" :key="room.id" :room="room"/>
		</div>
		<MkResult v-else-if="!discoverFetching && !discoverError" type="empty" text="暂无可发现的公开群聊"/>
		<div v-if="discoverError" class="_gaps_s">
			<MkInfo warn>公开群列表加载失败，请稍后重试。</MkInfo>
			<div class="_buttons">
				<MkButton rounded @click="refreshDiscover"><i class="ti ti-refresh"></i> 重试</MkButton>
			</div>
		</div>
		<MkLoading v-if="discoverFetching"/>
		<div v-if="discoverHasMore && !discoverFetching" class="_buttons">
			<MkButton rounded @click="loadMoreDiscover"><i class="ti ti-chevron-down"></i> 加载更多</MkButton>
		</div>
	</section>

	<div :class="$style.summaryGrid">
		<button class="_button" :class="$style.summaryCard" :disabled="summary.invitations === 0" @click="focusSection('invitations')">
			<div :class="$style.summaryLabel">邀请</div>
			<div :class="$style.summaryValue">{{ summary.invitations }}</div>
		</button>
		<button class="_button" :class="$style.summaryCard" :disabled="summary.myRequests === 0" @click="focusSection('requests')">
			<div :class="$style.summaryLabel">我的申请</div>
			<div :class="$style.summaryValue">{{ summary.myRequests }}</div>
		</button>
		<button class="_button" :class="$style.summaryCard" :disabled="summary.pendingRequests === 0" @click="focusSection('approvals')">
			<div :class="$style.summaryLabel">待审批</div>
			<div :class="$style.summaryValue">{{ summary.pendingRequests }}</div>
		</button>
	</div>

	<MkInfo v-if="summary.pendingRequests > 0" :class="$style.pendingInfo">
		你管理的群聊还有 {{ summary.pendingRequests }} 条待审批申请，可以直接在下方展开对应群聊处理。
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
		<MkFolder v-for="request in requests" :key="request.id" :defaultOpen="false">
			<template #icon><i class="ti ti-send"></i></template>
			<template #label>{{ request.room.name }}</template>
			<template #suffix><MkTime :time="request.createdAt"/></template>

			<div class="_gaps_s">
				<XRoom :room="request.room"/>
				<MkInfo v-if="request.message">{{ request.message }}</MkInfo>
			</div>
		</MkFolder>
	</section>

	<section v-if="approvalRooms.length > 0" ref="approvalSection" class="_gaps_s">
		<h2 :class="$style.sectionTitle">待审批申请</h2>
		<MkFolder
			v-for="approvalRoom in approvalRooms"
			:key="approvalRoom.id"
			:defaultOpen="false"
			@opened="fetchApprovalRequests(approvalRoom)"
		>
			<template #icon><i class="ti ti-shield-check"></i></template>
			<template #label>{{ approvalRoom.name }}</template>
			<template #suffix>待处理 {{ approvalRoom.pendingRequestCount ?? 0 }}</template>

			<div class="_gaps_s">
				<XRoom :room="approvalRoom"/>

				<div v-if="approvalLoadingRoomIds.includes(approvalRoom.id)">
					<MkLoading/>
				</div>

				<div v-else-if="approvalErrors[approvalRoom.id]" class="_gaps_s">
					<MkInfo warn>申请列表加载失败，请稍后重试。</MkInfo>
					<div class="_buttons">
						<MkButton rounded @click="fetchApprovalRequests(approvalRoom, true)"><i class="ti ti-refresh"></i> 重试</MkButton>
					</div>
				</div>

				<div v-else-if="approvalRequestsByRoom[approvalRoom.id]?.length" class="_gaps_s">
					<div v-for="request in approvalRequestsByRoom[approvalRoom.id]" :key="request.id" :class="$style.requestCard">
						<MkA :class="$style.requestUser" :to="userPage(request.user)">
							<MkUserCardMini :user="request.user" :withChart="false"/>
						</MkA>
						<div v-if="request.message" :class="$style.requestMessage">{{ request.message }}</div>
						<div class="_buttons">
							<MkButton rounded small @click="acceptApprovalRequest(approvalRoom, request)"><i class="ti ti-check"></i> 通过</MkButton>
							<MkButton rounded small danger @click="rejectApprovalRequest(approvalRoom, request)"><i class="ti ti-x"></i> 拒绝</MkButton>
						</div>
					</div>
				</div>

				<MkResult v-else type="empty" text="当前没有待审批申请"/>
			</div>
		</MkFolder>
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
		<MkResult v-else-if="!fetching && !fetchError" type="empty" text="暂无群聊"/>
		<MkLoading v-if="fetching"/>
	</section>
</div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onMounted, ref, useTemplateRef, watch } from 'vue';
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
import MkInput from '@/components/MkInput.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { useGlobalEvent } from '@/events.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { userPage } from '@/filters/user.js';
import { useRouter } from '@/router.js';
import { misskeyApi } from '@/utility/misskey-api.js';

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

type GroupFilter = 'all' | 'owned' | 'managed' | 'joined';
type FocusTarget = 'invitations' | 'requests' | 'approvals' | null;

const router = useRouter();

const props = defineProps<{
	focusTarget?: FocusTarget;
}>();

const fetching = ref(true);
const fetchError = ref(false);
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
const roomFilter = ref<GroupFilter>('all');
const showDiscover = ref(false);
const ownedRooms = ref<Misskey.entities.ChatRoom[]>([]);
const joiningMemberships = ref<Misskey.entities.ChatRoomMembership[]>([]);
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);
const requests = ref<Misskey.entities.ChatRoomJoinRequest[]>([]);
const discoverRooms = ref<Misskey.entities.ChatRoom[]>([]);
const discoverFetching = ref(false);
const discoverError = ref(false);
const discoverQuery = ref('');
const discoverUntilId = ref<string | null>(null);
const discoverHasMore = ref(false);
const approvalRequestsByRoom = ref<Partial<Record<string, Misskey.entities.ChatRoomJoinRequest[]>>>({});
const approvalErrors = ref<Partial<Record<string, boolean>>>({});
const approvalLoadingRoomIds = ref<string[]>([]);
const invitationSection = useTemplateRef('invitationSection');
const requestSection = useTemplateRef('requestSection');
const approvalSection = useTemplateRef('approvalSection');

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
		const pendingDiff = (b.pendingRequestCount ?? 0) - (a.pendingRequestCount ?? 0);
		if (pendingDiff !== 0) return pendingDiff;

		const aRolePriority = a.myRole === 'owner' ? 0 : a.myRole === 'admin' ? 1 : 2;
		const bRolePriority = b.myRole === 'owner' ? 0 : b.myRole === 'admin' ? 1 : 2;
		if (aRolePriority !== bRolePriority) return aRolePriority - bRolePriority;

		if (a.memberCount !== b.memberCount) return b.memberCount - a.memberCount;
		return b.id.localeCompare(a.id);
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

const approvalRooms = computed(() => allRooms.value.filter(room => (room.pendingRequestCount ?? 0) > 0));

async function fetchSummary() {
	summary.value = await misskeyApi<ChatSummary>('chat/summary' as never, {} as never);
}

async function fetchDiscoverRooms(options?: {
	append?: boolean;
}) {
	discoverFetching.value = true;
	discoverError.value = false;
	try {
		const rooms = await misskeyApi<Misskey.entities.ChatRoom[]>('chat/rooms/discover' as never, {
			limit: 30,
			query: discoverQuery.value.trim() || undefined,
			untilId: options?.append ? discoverUntilId.value ?? undefined : undefined,
		} as never);

		const nextRooms = rooms.filter(room => !room.isJoined);
		discoverRooms.value = options?.append ? [...discoverRooms.value, ...nextRooms.filter(room => !discoverRooms.value.some(existing => existing.id === room.id))] : nextRooms;
		discoverHasMore.value = rooms.length === 30;
		discoverUntilId.value = rooms.length > 0 ? rooms[rooms.length - 1].id : null;
	} catch {
		discoverError.value = true;
	} finally {
		discoverFetching.value = false;
	}
}

async function fetchAll() {
	fetching.value = true;
	fetchError.value = false;

	try {
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

		if (props.focusTarget != null) {
			requestAnimationFrame(() => {
				focusSection(props.focusTarget ?? 'invitations');
			});
		}
	} catch {
		fetchError.value = true;
	} finally {
		fetching.value = false;
	}
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

	approvalSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function createRoom() {
	const { canceled, result } = await os.form('创建群聊', {
		name: {
			type: 'string',
			label: '群聊名称',
			required: true,
		},
		description: {
			type: 'string',
			label: i18n.ts.description,
			required: false,
			multiline: true,
		},
		joinPolicy: {
			type: 'enum',
			label: '加入方式',
			default: 'invite_only',
			enum: [{
				label: '仅邀请',
				value: 'invite_only',
			}, {
				label: '需申请审核',
				value: 'request_required',
			}, {
				label: '公开可加入',
				value: 'public',
			}],
		},
		discoverability: {
			type: 'enum',
			label: '可发现性',
			default: 'private',
			enum: [{
				label: '私密',
				value: 'private',
			}, {
				label: '不公开（仅链接可见）',
				value: 'unlisted',
			}, {
				label: '公开可发现',
				value: 'public',
			}],
		},
	});
	if (canceled) return;

	const name = result.name.trim();
	if (name.length === 0) {
		await os.alert({
			type: 'warning',
			text: '请输入群聊名称。',
		});
		return;
	}

	const joinPolicy = result.joinPolicy as Misskey.entities.ChatRoom['joinPolicy'];
	const discoverability = result.discoverability as Misskey.entities.ChatRoom['discoverability'];
	if (joinPolicy === 'public' && discoverability === 'private') {
		await os.alert({
			type: 'warning',
			text: '公开可加入的群聊不能设为私密，请选择“不公开”或“公开可发现”。',
		});
		return;
	}

	const room = await misskeyApi('chat/rooms/create', {
		name,
		description: result.description?.trim() || undefined,
		joinPolicy,
		discoverability,
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

async function refreshDiscover() {
	discoverUntilId.value = null;
	await fetchDiscoverRooms();
}

async function searchDiscover() {
	discoverUntilId.value = null;
	await fetchDiscoverRooms();
}

async function loadMoreDiscover() {
	if (!discoverHasMore.value) return;
	await fetchDiscoverRooms({ append: true });
}

function patchRoomCollections(roomId: string, patch: Partial<Misskey.entities.ChatRoom>) {
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
}

async function fetchApprovalRequests(room: Misskey.entities.ChatRoom, force = false) {
	if (!force && approvalRequestsByRoom.value[room.id] != null) return;
	if (approvalLoadingRoomIds.value.includes(room.id)) return;

	approvalLoadingRoomIds.value = [...approvalLoadingRoomIds.value, room.id];
	approvalErrors.value = {
		...approvalErrors.value,
		[room.id]: false,
	};

	try {
		const result = await misskeyApi('chat/rooms/requests/list', {
			roomId: room.id,
			limit: 30,
		});
		approvalRequestsByRoom.value = {
			...approvalRequestsByRoom.value,
			[room.id]: result,
		};
	} catch {
		approvalErrors.value = {
			...approvalErrors.value,
			[room.id]: true,
		};
	} finally {
		approvalLoadingRoomIds.value = approvalLoadingRoomIds.value.filter(id => id !== room.id);
	}
}

async function acceptApprovalRequest(room: Misskey.entities.ChatRoom, request: Misskey.entities.ChatRoomJoinRequest) {
	await os.apiWithDialog('chat/rooms/requests/accept', {
		roomId: room.id,
		userId: request.userId,
	}, undefined, {
		'a8844dab-b854-4c8c-ba88-f8eb4a93a71b': {
			title: room.name,
			text: '群成员已达上限。',
		},
		'f5648269-cf9d-4e13-9075-b9fba45f81e7': {
			title: room.name,
			text: '该用户已被封禁，无法通过申请加入。',
		},
	});

	approvalRequestsByRoom.value = {
		...approvalRequestsByRoom.value,
		[room.id]: (approvalRequestsByRoom.value[room.id] ?? []).filter(item => item.id !== request.id),
	};
	patchRoomCollections(room.id, {
		pendingRequestCount: Math.max((room.pendingRequestCount ?? 1) - 1, 0),
		memberCount: room.memberCount + 1,
	});
	emitChatRoomUpdated(room.id, {
		pendingRequestCount: Math.max((room.pendingRequestCount ?? 1) - 1, 0),
		memberCount: room.memberCount + 1,
	});
	emitChatRoomCollectionsInvalidated(room.id, ['requests', 'counts', 'joiningRooms', 'ownedRooms']);
	emitChatHomeInvalidated({
		reason: 'room-join-request-accepted-from-groups',
		roomId: room.id,
		scopes: ['requests', 'counts', 'joiningRooms', 'ownedRooms'],
	});
	await fetchSummary();
}

async function rejectApprovalRequest(room: Misskey.entities.ChatRoom, request: Misskey.entities.ChatRoomJoinRequest) {
	await os.apiWithDialog('chat/rooms/requests/reject', {
		roomId: room.id,
		userId: request.userId,
	});

	approvalRequestsByRoom.value = {
		...approvalRequestsByRoom.value,
		[room.id]: (approvalRequestsByRoom.value[room.id] ?? []).filter(item => item.id !== request.id),
	};
	patchRoomCollections(room.id, {
		pendingRequestCount: Math.max((room.pendingRequestCount ?? 1) - 1, 0),
	});
	emitChatRoomUpdated(room.id, {
		pendingRequestCount: Math.max((room.pendingRequestCount ?? 1) - 1, 0),
	});
	emitChatRoomCollectionsInvalidated(room.id, ['requests', 'counts', 'ownedRooms']);
	emitChatHomeInvalidated({
		reason: 'room-join-request-rejected-from-groups',
		roomId: room.id,
		scopes: ['requests', 'counts', 'ownedRooms'],
	});
	await fetchSummary();
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
	patchRoomCollections(roomId, patch);
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

watch(() => props.focusTarget, (target) => {
	if (target == null) return;
	focusSection(target);
}, {
	immediate: true,
});
</script>

<style lang="scss" module>
.discoverControls {
	display: grid;
	gap: 12px;
}

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
	background: color-mix(in srgb, var(--MI_THEME-panel) 96%, var(--MI_THEME-bg) 4%);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 78%, transparent);
	transition: background 0.18s ease, border-color 0.18s ease;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-bg) 8%);
		border-color: color(from var(--MI_THEME-accent) srgb r g b / 0.26);
	}

	&:disabled {
		cursor: default;
		opacity: 0.72;

		&:hover {
			background: color-mix(in srgb, var(--MI_THEME-panel) 96%, var(--MI_THEME-bg) 4%);
			border-color: color-mix(in srgb, var(--MI_THEME-divider) 78%, transparent);
		}
	}
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

.requestCard {
	padding: 14px;
	border-radius: 16px;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 72%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-panel) 96%, var(--MI_THEME-bg) 4%);
}

.requestUser {
	display: block;
}

.requestMessage {
	margin-top: 8px;
	font-size: 0.92rem;
	line-height: 1.5;
	color: color-mix(in srgb, var(--MI_THEME-fg) 82%, transparent);
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
