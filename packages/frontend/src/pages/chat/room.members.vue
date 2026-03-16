<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkButton v-if="canInvite" primary rounded style="margin: 0 auto;" @click="emit('inviteUser')"><i class="ti ti-plus"></i> {{ i18n.ts._chat.inviteUser }}</MkButton>

	<MkA :class="$style.membershipBody" :to="`${userPage(room.owner)}`">
		<MkUserCardMini :user="room.owner"/>
	</MkA>

	<hr v-if="memberships.length > 0">

	<div v-for="membership in memberships" :key="membership.id" :class="$style.membership">
		<MkA :class="$style.membershipBody" :to="`${userPage(membership.user!)}`">
			<MkUserCardMini :user="membership.user!"/>
		</MkA>

		<div :class="$style.badge">{{ membership.role === 'admin' ? '管理员' : '成员' }}</div>

		<div v-if="canManageMembers" :class="$style.memberActions">
			<MkButton
				v-if="canManageAdmins && membership.role !== 'admin'"
				rounded
				small
				@click="addAdmin(membership)"
			><i class="ti ti-shield-check"></i> 设为管理员</MkButton>
			<MkButton
				v-if="canManageAdmins && membership.role === 'admin'"
				rounded
				small
				@click="removeAdmin(membership)"
			><i class="ti ti-shield-x"></i> 取消管理员</MkButton>
			<MkButton
				v-if="canManageAdmins"
				rounded
				small
				@click="transferOwner(membership)"
			><i class="ti ti-crown"></i> 转让群主</MkButton>
			<MkButton rounded small danger @click="kickMember(membership)"><i class="ti ti-user-minus"></i> {{ i18n.ts.remove }}</MkButton>
			<MkButton rounded small danger @click="banMember(membership)"><i class="ti ti-ban"></i> {{ i18n.ts.block }}</MkButton>
		</div>
	</div>

	<template v-if="canManageMembers">
		<template v-if="joinRequests.length > 0">
			<hr>

			<div>{{ i18n.ts._chat.joinRequests }}</div>

			<div v-for="joinRequest in joinRequests" :key="joinRequest.id" :class="$style.request">
				<MkA :class="$style.requestBody" :to="`${userPage(joinRequest.user)}`">
					<MkUserCardMini :user="joinRequest.user"/>
				</MkA>

				<div :class="$style.requestActions">
					<MkButton rounded small @click="acceptJoinRequest(joinRequest)"><i class="ti ti-check"></i> {{ i18n.ts.accept }}</MkButton>
					<MkButton rounded small danger @click="rejectJoinRequest(joinRequest)"><i class="ti ti-x"></i> {{ i18n.ts.reject }}</MkButton>
				</div>
			</div>
		</template>

		<template v-if="invitations.length > 0">
			<hr>

			<div>{{ i18n.ts._chat.sentInvitations }}</div>

			<div v-for="invitation in invitations" :key="invitation.id" :class="$style.invitation">
				<MkA :class="$style.invitationBody" :to="`${userPage(invitation.user)}`">
					<MkUserCardMini :user="invitation.user"/>
				</MkA>
				<MkButton rounded small danger @click="revokeInvitation(invitation)"><i class="ti ti-x"></i> {{ i18n.ts.cancel }}</MkButton>
			</div>
		</template>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { userPage } from '@/filters/user.js';

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const emit = defineEmits<{
	(ev: 'inviteUser'): void,
}>();

const canInvite = computed(() => props.room.canInvite ?? false);
const canManageMembers = computed(() => props.room.canManageMembers ?? false);
const canManageAdmins = computed(() => props.room.canManageAdmins ?? false);

const memberships = ref<Misskey.entities.ChatRoomMembership[]>([]);
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);
const joinRequests = ref<Misskey.entities.ChatRoomJoinRequest[]>([]);

async function fetchMemberships() {
	memberships.value = await misskeyApi('chat/rooms/members', {
		roomId: props.room.id,
		limit: 50,
	});
}

async function fetchOwnerData() {
	if (!canManageMembers.value) return;

	const [sentInvitations, pendingJoinRequests] = await Promise.all([
		misskeyApi('chat/rooms/invitations/outbox', {
			roomId: props.room.id,
			limit: 50,
		}),
		misskeyApi('chat/rooms/requests/list', {
			roomId: props.room.id,
			limit: 50,
		}),
	]);

	invitations.value = sentInvitations;
	joinRequests.value = pendingJoinRequests;
}

onMounted(async () => {
	await fetchMemberships();
	await fetchOwnerData();
});

async function acceptJoinRequest(joinRequest: Misskey.entities.ChatRoomJoinRequest) {
	const membership = await os.apiWithDialog('chat/rooms/requests/accept', {
		roomId: props.room.id,
		userId: joinRequest.userId,
	}, undefined, {
		'a8844dab-b854-4c8c-ba88-f8eb4a93a71b': {
			title: i18n.ts._chat.joinRequests,
			text: i18n.ts._chat.roomIsFull,
		},
	});

	joinRequests.value = joinRequests.value.filter(request => request.id !== joinRequest.id);
	memberships.value.unshift(membership);
}

async function rejectJoinRequest(joinRequest: Misskey.entities.ChatRoomJoinRequest) {
	await os.apiWithDialog('chat/rooms/requests/reject', {
		roomId: props.room.id,
		userId: joinRequest.userId,
	});

	joinRequests.value = joinRequests.value.filter(request => request.id !== joinRequest.id);
}

async function revokeInvitation(invitation: Misskey.entities.ChatRoomInvitation) {
	await os.apiWithDialog('chat/rooms/invitations/revoke', {
		invitationId: invitation.id,
	});
	invitations.value = invitations.value.filter(i => i.id !== invitation.id);
}

async function kickMember(membership: Misskey.entities.ChatRoomMembership) {
	await os.apiWithDialog('chat/rooms/members/kick', {
		roomId: props.room.id,
		userId: membership.userId,
	});
	memberships.value = memberships.value.filter(item => item.id !== membership.id);
}

async function banMember(membership: Misskey.entities.ChatRoomMembership) {
	await os.apiWithDialog('chat/rooms/members/ban', {
		roomId: props.room.id,
		userId: membership.userId,
	});
	memberships.value = memberships.value.filter(item => item.id !== membership.id);
}

async function addAdmin(membership: Misskey.entities.ChatRoomMembership) {
	await os.apiWithDialog('chat/rooms/admins/add', {
		roomId: props.room.id,
		userId: membership.userId,
	});
	memberships.value = memberships.value.map(item => item.id === membership.id ? { ...item, role: 'admin' } : item);
}

async function removeAdmin(membership: Misskey.entities.ChatRoomMembership) {
	await os.apiWithDialog('chat/rooms/admins/remove', {
		roomId: props.room.id,
		userId: membership.userId,
	});
	memberships.value = memberships.value.map(item => item.id === membership.id ? { ...item, role: 'member' } : item);
}

async function transferOwner(membership: Misskey.entities.ChatRoomMembership) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/transfer-owner', {
		roomId: props.room.id,
		userId: membership.userId,
	});

	await fetchMemberships();
	await fetchOwnerData();
}
</script>

<style lang="scss" module>
.membership {
	display: flex;
	align-items: center;
	gap: 8px;
}

.membershipBody {
	flex: 1;
	min-width: 0;
	margin-right: 8px;
}

.invitation {
	display: flex;
	align-items: center;
	gap: 8px;
}

.invitationBody {
	flex: 1;
	min-width: 0;
	margin-right: 8px;
}

.request {
	display: flex;
	align-items: center;
	gap: 8px;
}

.requestBody {
	flex: 1;
	min-width: 0;
}

.requestActions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	justify-content: flex-end;
}

.memberActions {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
	justify-content: flex-end;
}

.badge {
	opacity: 0.8;
	font-size: 0.85em;
}
</style>
