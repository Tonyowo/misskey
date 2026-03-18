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
	<MkResult v-if="!fetching && requests.length == 0" type="empty" :text="i18n.ts._chat.noRooms"/>
	<MkLoading v-if="fetching"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XRoom from './XRoom.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkInfo from '@/components/MkInfo.vue';

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
</script>

<style lang="scss" module>

</style>
