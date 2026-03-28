<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<MkPolkadots v-if="tab === 'home'" accented :height="200" style="margin-bottom: -200px;"/>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<XHome v-if="tab === 'home'"/>
		<XInvitations v-else-if="tab === 'invitations'"/>
		<XRequests v-else-if="tab === 'requests'"/>
		<XJoiningRooms v-else-if="tab === 'joiningRooms'"/>
		<XOwnedRooms v-else-if="tab === 'ownedRooms'"/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onActivated, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XHome from './home.home.vue';
import XInvitations from './home.invitations.vue';
import XRequests from './home.requests.vue';
import XJoiningRooms from './home.joiningRooms.vue';
import XOwnedRooms from './home.ownedRooms.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkPolkadots from '@/components/MkPolkadots.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useGlobalEvent } from '@/events.js';

const tab = ref('home');
const invitationCount = ref(0);
const requestCount = ref(0);
const joiningCount = ref(0);
const ownedCount = ref(0);
const pendingCount = ref(0);

const headerActions = computed(() => []);

const headerTabs = computed(() => [{
	key: 'home',
	title: '首页',
	icon: 'ti ti-home',
}, {
	key: 'invitations',
	title: invitationCount.value > 0 ? `邀请 (${invitationCount.value})` : '邀请',
	icon: 'ti ti-ticket',
}, {
	key: 'requests',
	title: requestCount.value > 0 ? `我的申请 (${requestCount.value})` : '我的申请',
	icon: 'ti ti-clock-hour-4',
}, {
	key: 'joiningRooms',
	title: joiningCount.value > 0 ? `已加入群聊 (${joiningCount.value})` : '已加入群聊',
	icon: 'ti ti-users-group',
}, {
	key: 'ownedRooms',
	title: ownedCount.value > 0 || pendingCount.value > 0 ? `我创建的群聊 (${ownedCount.value}${pendingCount.value > 0 ? ` / 待处理 ${pendingCount.value}` : ''})` : '我创建的群聊',
	icon: 'ti ti-settings',
}]);

async function fetchCounts() {
	const [invitations, requests, joining, owned, pending] = await Promise.all([
		misskeyApi('chat/rooms/invitations/inbox', { limit: 100 }),
		misskeyApi('chat/rooms/requests/mine', { limit: 100 }),
		misskeyApi('chat/rooms/joining', { limit: 100 }),
		misskeyApi('chat/rooms/owned', { limit: 100 }),
		misskeyApi('chat/rooms/requests/pending-count'),
	]);

	invitationCount.value = (invitations as Misskey.entities.ChatRoomInvitation[]).length;
	requestCount.value = (requests as Misskey.entities.ChatRoomJoinRequest[]).length;
	joiningCount.value = (joining as Misskey.entities.ChatRoomMembership[]).length;
	ownedCount.value = (owned as Misskey.entities.ChatRoom[]).length;
	pendingCount.value = pending.count;
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
	title: '消息',
	icon: 'ti ti-messages',
}));
</script>

<style lang="scss" module>
</style>
