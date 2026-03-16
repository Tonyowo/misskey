<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInput v-model="name_" :disabled="!isOwner">
		<template #label>{{ i18n.ts.name }}</template>
	</MkInput>

	<MkTextarea v-model="description_" :disabled="!isOwner">
		<template #label>{{ i18n.ts.description }}</template>
	</MkTextarea>

	<MkSelect v-model="joinPolicy_" :disabled="!isOwner" :items="joinPolicyItems">
		<template #label>Join policy</template>
	</MkSelect>

	<MkSelect v-model="discoverability_" :disabled="!isOwner" :items="discoverabilityItems">
		<template #label>Discoverability</template>
	</MkSelect>

	<MkInput v-model="maxMembers_" type="number" :disabled="!isOwner">
		<template #label>Max members</template>
	</MkInput>

	<MkSwitch v-model="memberCanInvite_" :disabled="!isOwner">
		<template #label>Allow members to invite</template>
	</MkSwitch>

	<MkSwitch v-model="allowJoinRequest_" :disabled="!isOwner">
		<template #label>Allow join requests</template>
	</MkSwitch>

	<MkButton v-if="isOwner" primary @click="save">{{ i18n.ts.save }}</MkButton>

	<hr>

	<MkButton v-if="isOwner || ($i.isAdmin || $i.isModerator)" danger @click="del">{{ i18n.ts._chat.deleteRoom }}</MkButton>

	<MkSwitch v-if="!isOwner && isJoined" v-model="isMuted">
		<template #label>{{ i18n.ts._chat.muteThisRoom }}</template>
	</MkSwitch>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import type { MkSelectItem } from '@/components/MkSelect.vue';
import { useRouter } from '@/router.js';

const router = useRouter();
const $i = ensureSignin();

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const isOwner = computed(() => {
	return props.room.ownerId === $i.id;
});
const isJoined = computed(() => props.room.isJoined ?? false);

const name_ = ref('');
const description_ = ref('');
const joinPolicy_ = ref<Misskey.entities.ChatRoom['joinPolicy']>('invite_only');
const discoverability_ = ref<Misskey.entities.ChatRoom['discoverability']>('private');
const maxMembers_ = ref(50);
const memberCanInvite_ = ref(false);
const allowJoinRequest_ = ref(true);
const isMuted = ref(false);
let syncingRoomState = false;

const joinPolicyItems: MkSelectItem<string>[] = [{
	value: 'invite_only',
	label: 'Invite only',
}, {
	value: 'request_required',
	label: 'Request required',
}, {
	value: 'public',
	label: 'Public',
}];

const discoverabilityItems: MkSelectItem<string>[] = [{
	value: 'private',
	label: 'Private',
}, {
	value: 'unlisted',
	label: 'Unlisted',
}, {
	value: 'public',
	label: 'Public',
}];

watch(() => props.room, (room) => {
	syncingRoomState = true;
	name_.value = room.name;
	description_.value = room.description;
	joinPolicy_.value = room.joinPolicy;
	discoverability_.value = room.discoverability;
	maxMembers_.value = room.maxMembers;
	memberCanInvite_.value = room.memberCanInvite;
	allowJoinRequest_.value = room.allowJoinRequest;
	isMuted.value = room.isMuted ?? false;
	syncingRoomState = false;
}, {
	immediate: true,
});

function save() {
	os.apiWithDialog('chat/rooms/update-settings', {
		roomId: props.room.id,
		name: name_.value,
		description: description_.value,
		joinPolicy: joinPolicy_.value,
		discoverability: discoverability_.value,
		memberCanInvite: memberCanInvite_.value,
		allowJoinRequest: allowJoinRequest_.value,
		maxMembers: maxMembers_.value,
	});
}

async function del() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.deleteAreYouSure({ x: name_.value }),
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/delete', {
		roomId: props.room.id,
	});
	router.push('/chat');
}

watch(isMuted, async () => {
	if (syncingRoomState) return;

	await os.apiWithDialog('chat/rooms/mute', {
		roomId: props.room.id,
		mute: isMuted.value,
	});
});
</script>

<style lang="scss" module>
.membership {
	display: flex;
}

.membershipBody {
	flex: 1;
	min-width: 0;
	margin-right: 8px;

	&:hover {
		text-decoration: none;
	}
}
</style>
