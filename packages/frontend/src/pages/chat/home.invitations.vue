<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div v-if="invitations.length > 0" class="_gaps_s">
		<MkFolder v-for="invitation in invitations" :key="invitation.id" :defaultOpen="true">
			<template #icon><i class="ti ti-users-group"></i></template>
			<template #label>{{ invitation.room.name }}</template>
			<template #suffix><MkTime :time="invitation.createdAt"/></template>
			<template #footer>
				<div class="_buttons">
					<MkButton primary @click="join(invitation)"><i class="ti ti-plus"></i> 接受邀请</MkButton>
					<MkButton danger @click="ignore(invitation)"><i class="ti ti-x"></i> 忽略</MkButton>
				</div>
			</template>

			<div :class="$style.invitationBody">
				<MkAvatar :user="invitation.room.owner" :class="$style.invitationBodyAvatar" link/>
				<div style="flex: 1;" class="_gaps_s">
					<MkUserName :user="invitation.room.owner"/>
					<hr>
					<div>{{ invitation.room.description === '' ? i18n.ts.noDescription : invitation.room.description }}</div>
				</div>
			</div>
		</MkFolder>
	</div>
	<MkResult v-if="!fetching && invitations.length == 0" type="empty" :text="i18n.ts._chat.noInvitations"/>
	<MkLoading v-if="fetching"/>
</div>
</template>

<script lang="ts" setup>
import { onActivated, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useRouter } from '@/router.js';
import MkFolder from '@/components/MkFolder.vue';
import { useGlobalEvent } from '@/events.js';
import {
	applyChatRoomPatch,
	emitChatHomeInvalidated,
	emitChatRoomCollectionsInvalidated,
	emitChatRoomUpdated,
	removeById,
	shouldRefreshChatCollections,
} from './state.js';

const router = useRouter();

const fetching = ref(true);
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);

async function fetchInvitations() {
	fetching.value = true;

	const res = await misskeyApi('chat/rooms/invitations/inbox');

	invitations.value = res;

	fetching.value = false;
}

async function join(invitation: Misskey.entities.ChatRoomInvitation) {
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
		reason: 'room-joined-from-invitation',
		roomId: invitation.room.id,
		scopes: ['myInvitations', 'joiningRooms', 'counts'],
	});

	router.push('/chat/room/:roomId', {
		params: {
			roomId: invitation.room.id,
		},
	});
}

async function ignore(invitation: Misskey.entities.ChatRoomInvitation) {
	await misskeyApi('chat/rooms/invitations/ignore', {
		roomId: invitation.room.id,
	});

	invitations.value = removeById(invitations.value, invitation.id);
	emitChatRoomUpdated(invitation.room.id, {
		invitationExists: false,
	});
	emitChatRoomCollectionsInvalidated(invitation.room.id, ['myInvitations']);
	emitChatHomeInvalidated({
		reason: 'room-invitation-ignored',
		roomId: invitation.room.id,
		scopes: ['myInvitations', 'counts'],
	});
}

onMounted(() => {
	fetchInvitations();
});

onActivated(() => {
	void fetchInvitations();
});

useGlobalEvent('chatRoomUpdated', (payload) => {
	invitations.value = invitations.value.map(invitation => applyChatRoomPatch(invitation, payload));
});

useGlobalEvent('chatRoomCollectionsInvalidated', (payload) => {
	if (!shouldRefreshChatCollections(payload, ['myInvitations'])) return;
	void fetchInvitations();
});
</script>

<style lang="scss" module>
.invitationBody {
	display: flex;
	align-items: center;
}

.invitationBodyAvatar {
	margin-right: 12px;
	width: 45px;
	height: 45px;
}
</style>
