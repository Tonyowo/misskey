<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkButton v-if="canInvite" primary rounded style="margin: 0 auto;" @click="inviteUser"><i class="ti ti-plus"></i> 邀请成员</MkButton>

	<div :class="$style.memberCard">
		<div :class="$style.memberMain">
			<div :class="$style.badgeRow">
				<div :class="$style.badge">群主</div>
			</div>
			<MkA :class="$style.memberBody" :to="`${userPage(room.owner)}`">
				<MkUserCardMini :user="room.owner" :withChart="false"/>
			</MkA>
		</div>
	</div>

	<hr v-if="memberships.length > 0">

	<div v-for="membership in memberships" :key="membership.id" :class="$style.memberCard">
		<div :class="$style.memberMain">
			<div :class="$style.badgeRow">
				<div :class="$style.badge">{{ membership.role === 'admin' ? '管理员' : '成员' }}</div>
				<div v-if="membership.isSpeakMuted" :class="[$style.badge, $style.badgeWarn]">已禁言</div>
			</div>

			<MkA :class="$style.memberBody" :to="`${userPage(membership.user!)}`">
				<MkUserCardMini :user="membership.user!" :withChart="false"/>
			</MkA>

			<div v-if="membership.isSpeakMuted" :class="$style.metaText">
				<span v-if="membership.speakMutedUntil">解除时间：<MkTime :time="membership.speakMutedUntil" mode="detail"/></span>
				<span v-else>永久禁言</span>
				<span v-if="membership.speakMuteReason">原因：{{ membership.speakMuteReason }}</span>
				<span v-if="membership.speakMutedBy">操作人：{{ formatUserName(membership.speakMutedBy) }}</span>
			</div>
		</div>

		<div
			v-if="canManageAdmins || ((canKickMembers || canBanMembers || canMuteMembers) && canManageTargetMembership(membership))"
			:class="$style.memberActions"
		>
			<MkButton
				v-if="canManageAdmins && membership.role !== 'admin'"
				rounded
				small
				@click="addAdmin(membership)"
			>
				<i class="ti ti-shield-check"></i> 设为管理员
			</MkButton>
			<MkButton
				v-if="canManageAdmins && membership.role === 'admin'"
				rounded
				small
				@click="removeAdmin(membership)"
			>
				<i class="ti ti-shield-x"></i> 取消管理员
			</MkButton>
			<MkButton
				v-if="canManageAdmins"
				rounded
				small
				@click="transferOwner(membership)"
			>
				<i class="ti ti-crown"></i> 转让群主
			</MkButton>
			<MkButton
				v-if="canMuteMembers && canManageTargetMembership(membership) && !membership.isSpeakMuted"
				rounded
				small
				@click="muteMember(membership)"
			>
				<i class="ti ti-message-off"></i> 禁言
			</MkButton>
			<MkButton
				v-if="canMuteMembers && canManageTargetMembership(membership) && membership.isSpeakMuted"
				rounded
				small
				@click="unmuteMember(membership)"
			>
				<i class="ti ti-message-circle-2"></i> 解除禁言
			</MkButton>
			<MkButton v-if="canKickMembers && canManageTargetMembership(membership)" rounded small danger @click="kickMember(membership)"><i class="ti ti-user-minus"></i> 删除</MkButton>
			<MkButton v-if="canBanMembers && canManageTargetMembership(membership)" rounded small danger @click="banMember(membership)"><i class="ti ti-ban"></i> 封禁</MkButton>
		</div>
	</div>

	<template v-if="canManageJoinRequests">
		<hr>

		<div :class="$style.sectionHeader">入群申请</div>

		<div v-if="joinRequests.length === 0" :class="$style.emptyText">暂无待处理申请</div>

		<div v-for="joinRequest in joinRequests" :key="joinRequest.id" :class="$style.request">
			<div :class="$style.requestBody">
				<MkA :class="$style.requestUser" :to="`${userPage(joinRequest.user)}`">
					<MkUserCardMini :user="joinRequest.user" :withChart="false"/>
				</MkA>
				<div v-if="joinRequest.message" :class="$style.requestMessage">{{ joinRequest.message }}</div>
			</div>

			<div :class="$style.requestActions">
				<MkButton rounded small @click="acceptJoinRequest(joinRequest)"><i class="ti ti-check"></i> 通过</MkButton>
				<MkButton rounded small danger @click="rejectJoinRequest(joinRequest)"><i class="ti ti-x"></i> 拒绝</MkButton>
			</div>
		</div>
	</template>

	<template v-if="canInvite">
		<hr>

		<div :class="$style.sectionHeader">已发送的邀请</div>

		<div v-if="invitations.length === 0" :class="$style.emptyText">暂无已发送邀请</div>

		<div v-for="invitation in invitations" :key="invitation.id" :class="$style.request">
			<MkA :class="$style.requestBody" :to="`${userPage(invitation.user)}`">
				<MkUserCardMini :user="invitation.user" :withChart="false"/>
			</MkA>
			<div :class="$style.requestActions">
				<MkButton rounded small danger @click="revokeInvitation(invitation)"><i class="ti ti-x"></i> 取消</MkButton>
			</div>
		</div>
	</template>

	<template v-if="canBanMembers">
		<hr>

		<div :class="$style.sectionHeader">封禁列表</div>

		<div v-if="bans.length === 0" :class="$style.emptyText">暂无封禁成员</div>

		<div v-for="ban in bans" :key="ban.id" :class="$style.request">
			<div :class="$style.requestBody">
				<MkA v-if="ban.user" :class="$style.requestUser" :to="`${userPage(ban.user)}`">
					<MkUserCardMini :user="ban.user" :withChart="false"/>
				</MkA>
				<div v-else :class="$style.deletedUser">用户已不可用</div>
				<div :class="$style.metaText">
					<span v-if="ban.createdBy">操作人：{{ formatUserName(ban.createdBy) }}</span>
					<span v-if="ban.expiresAt">到期时间：<MkTime :time="ban.expiresAt" mode="detail"/></span>
					<span v-else>永久封禁</span>
				</div>
				<div v-if="ban.reason" :class="$style.requestMessage">原因：{{ ban.reason }}</div>
			</div>

			<div :class="$style.requestActions">
				<MkButton rounded small @click="unbanMember(ban)"><i class="ti ti-lock-open"></i> 解除封禁</MkButton>
			</div>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { userPage } from '@/filters/user.js';
import MkTime from '@/components/global/MkTime.vue';
import type { ChatCollectionScope } from '@/events.js';
import {
	emitChatHomeInvalidated,
	emitChatRoomCollectionsInvalidated,
	emitChatRoomUpdated,
	removeById,
	updateById,
	upsertById,
} from './state.js';

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const emit = defineEmits<{
	(ev: 'inviteUser', onInvited?: (invitation: Misskey.entities.ChatRoomInvitation) => Promise<void> | void): void,
	(ev: 'updated', room: Misskey.entities.ChatRoom): void,
}>();

const canInvite = computed(() => props.room.canInvite ?? false);
const canManageAdmins = computed(() => props.room.canManageAdmins ?? false);
const canManageJoinRequests = computed(() => props.room.canManageJoinRequests ?? false);
const canKickMembers = computed(() => props.room.canKickMembers ?? false);
const canBanMembers = computed(() => props.room.canBanMembers ?? false);
const canMuteMembers = computed(() => props.room.canMuteMembers ?? false);

const memberships = ref<Misskey.entities.ChatRoomMembership[]>([]);
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);
const joinRequests = ref<Misskey.entities.ChatRoomJoinRequest[]>([]);
const bans = ref<Misskey.entities.ChatRoomBan[]>([]);

function formatUserName(user: Misskey.entities.UserLite) {
	return user.name?.trim() || `@${user.username}`;
}

function canManageTargetMembership(membership: Misskey.entities.ChatRoomMembership) {
	return membership.role !== 'admin' || canManageAdmins.value;
}

function patchRoom(patch: Partial<Misskey.entities.ChatRoom>) {
	emit('updated', {
		...props.room,
		...patch,
	});
	emitChatRoomUpdated(props.room.id, patch);
}

async function refreshRoomState() {
	const updated = await misskeyApi('chat/rooms/show', {
		roomId: props.room.id,
	});
	emit('updated', updated);
}

async function fetchMemberships() {
	memberships.value = await misskeyApi('chat/rooms/members', {
		roomId: props.room.id,
		limit: 50,
	});
}

async function fetchInvitations() {
	if (!canInvite.value) {
		invitations.value = [];
		return;
	}

	invitations.value = await misskeyApi('chat/rooms/invitations/outbox', {
		roomId: props.room.id,
		limit: 50,
	});
}

async function fetchJoinRequests() {
	if (!canManageJoinRequests.value) {
		joinRequests.value = [];
		return;
	}

	joinRequests.value = await misskeyApi('chat/rooms/requests/list', {
		roomId: props.room.id,
		limit: 50,
	});
}

async function fetchBans() {
	if (!canBanMembers.value) {
		bans.value = [];
		return;
	}

	bans.value = await misskeyApi('chat/rooms/bans/list', {
		roomId: props.room.id,
		limit: 50,
	});
}

async function fetchAll() {
	await Promise.all([
		fetchMemberships(),
		fetchInvitations(),
		fetchJoinRequests(),
		fetchBans(),
	]);
}

function invalidateChat(scopes: ChatCollectionScope[], reason: string) {
	emitChatRoomCollectionsInvalidated(props.room.id, scopes);
	emitChatHomeInvalidated({
		reason,
		roomId: props.room.id,
		scopes,
	});
}

function syncAfterMutation(scopes: ChatCollectionScope[], reason: string, tasks: Array<() => Promise<void>>) {
	invalidateChat(scopes, reason);
	void Promise.all([
		refreshRoomState(),
		...tasks.map(task => task()),
	]).catch(() => {
	});
}

watch(() => [props.room.id, canInvite.value, canManageJoinRequests.value, canBanMembers.value] as const, async () => {
	await fetchAll();
}, {
	immediate: true,
});

async function acceptJoinRequest(joinRequest: Misskey.entities.ChatRoomJoinRequest) {
	const membership = await os.apiWithDialog('chat/rooms/requests/accept', {
		roomId: props.room.id,
		userId: joinRequest.userId,
	}, undefined, {
		'a8844dab-b854-4c8c-ba88-f8eb4a93a71b': {
			title: '入群申请',
			text: '群成员已达上限。',
		},
	});

	joinRequests.value = removeById(joinRequests.value, joinRequest.id);
	memberships.value = upsertById(memberships.value, membership);
	patchRoom({
		memberCount: props.room.memberCount + 1,
		pendingRequestCount: Math.max((props.room.pendingRequestCount ?? joinRequests.value.length + 1) - 1, 0),
	});

	syncAfterMutation(['members', 'requests', 'counts', 'joiningRooms', 'ownedRooms'], 'join-request-accepted', [
		fetchMemberships,
		fetchJoinRequests,
	]);
}

function inviteUser() {
	emit('inviteUser', async (invitation) => {
		invitations.value = upsertById(invitations.value, invitation);
		void fetchInvitations().catch(() => {
		});
	});
}

async function rejectJoinRequest(joinRequest: Misskey.entities.ChatRoomJoinRequest) {
	await os.apiWithDialog('chat/rooms/requests/reject', {
		roomId: props.room.id,
		userId: joinRequest.userId,
	});

	joinRequests.value = removeById(joinRequests.value, joinRequest.id);
	patchRoom({
		pendingRequestCount: Math.max((props.room.pendingRequestCount ?? joinRequests.value.length + 1) - 1, 0),
	});

	syncAfterMutation(['requests', 'counts', 'ownedRooms'], 'join-request-rejected', [
		fetchJoinRequests,
	]);
}

async function revokeInvitation(invitation: Misskey.entities.ChatRoomInvitation) {
	await os.apiWithDialog('chat/rooms/invitations/revoke', {
		invitationId: invitation.id,
	});

	invitations.value = removeById(invitations.value, invitation.id);
	syncAfterMutation(['invitations'], 'room-invitation-revoked', [
		fetchInvitations,
	]);
}

async function promptModerationParams(title: string) {
	const reasonInput = await os.inputText({
		title,
		text: '原因（选填）',
		maxLength: 1024,
	});
	if (reasonInput.canceled) return null;

	const durationInput = await os.inputText({
		title,
		text: '持续小时数（留空表示永久）',
		placeholder: '例如 24 或 1.5',
	});
	if (durationInput.canceled) return null;

	const rawHours = durationInput.result?.trim();
	if (rawHours != null && rawHours !== '') {
		const hours = Number.parseFloat(rawHours);
		if (!Number.isFinite(hours) || hours <= 0) {
			await os.alert({
				type: 'warning',
				text: '请输入大于 0 的小时数。',
			});
			return null;
		}

		return {
			reason: reasonInput.result?.trim() || null,
			expiresAt: Date.now() + (hours * 60 * 60 * 1000),
		};
	}

	return {
		reason: reasonInput.result?.trim() || null,
		expiresAt: null,
	};
}

async function kickMember(membership: Misskey.entities.ChatRoomMembership) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: `确定要移出 ${formatUserName(membership.user!)} 吗？`,
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/members/kick', {
		roomId: props.room.id,
		userId: membership.userId,
	});

	memberships.value = removeById(memberships.value, membership.id);
	patchRoom({
		memberCount: Math.max(props.room.memberCount - 1, 0),
	});

	syncAfterMutation(['members', 'counts', 'joiningRooms'], 'room-member-kicked', [
		fetchMemberships,
	]);
}

async function banMember(membership: Misskey.entities.ChatRoomMembership) {
	const moderationParams = await promptModerationParams(`封禁 ${formatUserName(membership.user!)}`);
	if (moderationParams == null) return;

	await os.apiWithDialog('chat/rooms/members/ban', {
		roomId: props.room.id,
		userId: membership.userId,
		reason: moderationParams.reason ?? undefined,
		expiresAt: moderationParams.expiresAt ?? undefined,
	});

	memberships.value = removeById(memberships.value, membership.id);
	patchRoom({
		memberCount: Math.max(props.room.memberCount - 1, 0),
	});

	syncAfterMutation(['members', 'bans', 'counts', 'joiningRooms'], 'room-member-banned', [
		fetchMemberships,
		fetchBans,
	]);
}

async function muteMember(membership: Misskey.entities.ChatRoomMembership) {
	const moderationParams = await promptModerationParams(`禁言 ${formatUserName(membership.user!)}`);
	if (moderationParams == null) return;

	await os.apiWithDialog('chat/rooms/members/mute', {
		roomId: props.room.id,
		userId: membership.userId,
		reason: moderationParams.reason ?? undefined,
		expiresAt: moderationParams.expiresAt ?? undefined,
	});

	memberships.value = updateById(memberships.value, membership.id, item => ({
		...item,
		isSpeakMuted: true,
		speakMutedUntil: moderationParams.expiresAt != null ? new Date(moderationParams.expiresAt).toISOString() : null,
		speakMuteReason: moderationParams.reason ?? null,
	}));

	syncAfterMutation(['members'], 'room-member-muted', [
		fetchMemberships,
	]);
}

async function unmuteMember(membership: Misskey.entities.ChatRoomMembership) {
	await os.apiWithDialog('chat/rooms/members/unmute', {
		roomId: props.room.id,
		userId: membership.userId,
	});

	memberships.value = updateById(memberships.value, membership.id, item => ({
		...item,
		isSpeakMuted: false,
		speakMutedUntil: null,
		speakMuteReason: null,
	}));

	syncAfterMutation(['members'], 'room-member-unmuted', [
		fetchMemberships,
	]);
}

async function unbanMember(ban: Misskey.entities.ChatRoomBan) {
	await os.apiWithDialog('chat/rooms/members/unban', {
		roomId: props.room.id,
		userId: ban.userId,
	});

	bans.value = removeById(bans.value, ban.id);
	syncAfterMutation(['bans'], 'room-member-unbanned', [
		fetchBans,
	]);
}

async function addAdmin(membership: Misskey.entities.ChatRoomMembership) {
	await os.apiWithDialog('chat/rooms/admins/add', {
		roomId: props.room.id,
		userId: membership.userId,
	});

	memberships.value = updateById(memberships.value, membership.id, item => ({
		...item,
		role: 'admin',
	}));

	syncAfterMutation(['members'], 'room-admin-added', [
		fetchMemberships,
	]);
}

async function removeAdmin(membership: Misskey.entities.ChatRoomMembership) {
	await os.apiWithDialog('chat/rooms/admins/remove', {
		roomId: props.room.id,
		userId: membership.userId,
	});

	memberships.value = updateById(memberships.value, membership.id, item => ({
		...item,
		role: 'member',
	}));

	syncAfterMutation(['members'], 'room-admin-removed', [
		fetchMemberships,
	]);
}

async function transferOwner(membership: Misskey.entities.ChatRoomMembership) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: `确定要将群主转让给 ${formatUserName(membership.user!)} 吗？`,
	});
	if (canceled) return;

	const updated = await os.apiWithDialog('chat/rooms/transfer-owner', {
		roomId: props.room.id,
		userId: membership.userId,
	});

	emit('updated', updated);
	emitChatRoomUpdated(props.room.id, updated);
	syncAfterMutation(['members', 'ownedRooms', 'joiningRooms'], 'room-owner-transferred', [
		fetchAll,
	]);
}
</script>

<style lang="scss" module>
.memberCard {
	display: grid;
	gap: 8px;
	padding: 8px 0 10px;
}

.memberMain {
	display: grid;
	gap: 6px;
	min-width: 0;
}

.memberBody {
	display: block;
	min-width: 0;

	&:hover {
		text-decoration: none;
	}
}
.badgeRow {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.badge {
	padding: 4px 10px;
	border-radius: 999px;
	background: var(--MI_THEME-buttonBg);
	font-size: 0.85em;
}

.badgeWarn {
	color: #d95b29;
	background: color-mix(in srgb, #d95b29 15%, var(--MI_THEME-panel));
}

.metaText {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.9em;
	opacity: 0.78;
}

.memberActions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	justify-content: flex-start;
}

.sectionHeader {
	font-weight: 700;
}

.emptyText {
	opacity: 0.72;
}

.request {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 12px 0;
}

.requestBody {
	flex: 1;
	min-width: 0;
}

.requestUser {
	display: block;
}

.requestMessage {
	margin-top: 8px;
	font-size: 0.9em;
	opacity: 0.82;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.requestActions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	justify-content: flex-end;
}

.deletedUser {
	font-size: 0.95em;
	opacity: 0.72;
}
</style>
