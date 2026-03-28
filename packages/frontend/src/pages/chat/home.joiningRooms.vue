<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div v-if="memberships.length > 0" class="_gaps_s">
		<XRoom v-for="membership in memberships" :key="membership.id" :room="membership.room!"/>
	</div>
	<MkResult v-if="!fetching && memberships.length == 0" type="empty" :text="i18n.ts._chat.noRooms"/>
	<MkLoading v-if="fetching"/>
</div>
</template>

<script lang="ts" setup>
import { onActivated, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XRoom from './XRoom.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useGlobalEvent } from '@/events.js';
import { applyChatRoomPatch, shouldRefreshChatCollections } from './state.js';

const fetching = ref(true);
const memberships = ref<Misskey.entities.ChatRoomMembership[]>([]);

async function fetchRooms() {
	fetching.value = true;

	const res = await misskeyApi('chat/rooms/joining');

	memberships.value = res;

	fetching.value = false;
}

onMounted(() => {
	fetchRooms();
});

onActivated(() => {
	void fetchRooms();
});

useGlobalEvent('chatRoomUpdated', (payload) => {
	memberships.value = memberships.value.map(membership => applyChatRoomPatch(membership, payload));
});

useGlobalEvent('chatRoomCollectionsInvalidated', (payload) => {
	if (!shouldRefreshChatCollections(payload, ['joiningRooms'])) return;
	void fetchRooms();
});
</script>

<style lang="scss" module>

</style>
