<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div v-if="requests.length > 0" class="_gaps_s">
		<div v-for="request in requests" :key="request.id" class="_gaps_s">
			<XRoom :room="request.room"/>
			<MkInfo v-if="request.message">{{ request.message }}</MkInfo>
		</div>
	</div>
	<MkResult v-if="!fetching && requests.length == 0" type="empty" text="没有申请"/>
	<MkLoading v-if="fetching"/>
</div>
</template>

<script lang="ts" setup>
import { onActivated, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XRoom from './XRoom.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkInfo from '@/components/MkInfo.vue';
import { useGlobalEvent } from '@/events.js';
import { applyChatRoomPatch, shouldRefreshChatCollections } from './state.js';

const fetching = ref(true);
const requests = ref<Misskey.entities.ChatRoomJoinRequest[]>([]);

async function fetchRequests() {
	fetching.value = true;
	requests.value = await misskeyApi('chat/rooms/requests/mine');
	fetching.value = false;
}

onMounted(() => {
	fetchRequests();
});

onActivated(() => {
	void fetchRequests();
});

useGlobalEvent('chatRoomUpdated', (payload) => {
	requests.value = requests.value.map(request => applyChatRoomPatch(request, payload));
});

useGlobalEvent('chatRoomCollectionsInvalidated', (payload) => {
	if (!shouldRefreshChatCollections(payload, ['myRequests'])) return;
	void fetchRequests();
});
</script>

<style lang="scss" module>

</style>
