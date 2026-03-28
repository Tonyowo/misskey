<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div v-if="rooms.length > 0" class="_gaps_s">
		<XRoom v-for="room in rooms" :key="room.id" :room="room"/>
	</div>
	<MkResult v-if="!fetching && rooms.length == 0" type="empty" :text="i18n.ts._chat.noRooms"/>
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
import { shouldRefreshChatCollections } from './state.js';

const fetching = ref(true);
const rooms = ref<Misskey.entities.ChatRoom[]>([]);

async function fetchRooms() {
	fetching.value = true;

	const res = await misskeyApi('chat/rooms/owned', {
	});

	rooms.value = res;

	fetching.value = false;
}

onMounted(() => {
	fetchRooms();
});

onActivated(() => {
	void fetchRooms();
});

useGlobalEvent('chatRoomUpdated', ({ roomId, patch }) => {
	rooms.value = rooms.value.map(room => room.id === roomId ? {
		...room,
		...patch,
	} : room);
});

useGlobalEvent('chatRoomCollectionsInvalidated', (payload) => {
	if (!shouldRefreshChatCollections(payload, ['ownedRooms'])) return;
	void fetchRooms();
});
</script>

<style lang="scss" module>

</style>
