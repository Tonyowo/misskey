<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div :class="$style.avatarPanel">
		<button
			type="button"
			class="_button"
			:class="[$style.avatarPreview, { [$style.avatarPreviewClickable]: canEditAvatar }]"
			@click="canEditAvatar ? openAvatarMenu($event) : undefined"
		>
			<img v-if="avatarUrl_" :src="avatarUrl_" :class="$style.avatarImage" alt="">
			<div v-else :class="$style.avatarFallback">
				<i class="ti ti-users-group"></i>
			</div>
		</button>
		<div :class="$style.avatarMeta">
			<div :class="$style.avatarTitle">群头像</div>
			<div :class="$style.avatarHint">建议使用方形图片，保存后生效。</div>
			<div v-if="canEditAvatar" class="_buttons">
				<MkButton rounded @click="openAvatarMenu">设置头像</MkButton>
				<MkButton v-if="avatarFileId_ != null" rounded danger @click="removeAvatar">移除头像</MkButton>
				<MkButton v-if="!isOwner" primary rounded @click="saveAvatar">保存头像</MkButton>
			</div>
		</div>
	</div>

	<MkInput v-model="name_" :disabled="!isOwner">
		<template #label>{{ i18n.ts.name }}</template>
	</MkInput>

	<MkTextarea v-model="description_" :disabled="!isOwner">
		<template #label>{{ i18n.ts.description }}</template>
	</MkTextarea>

	<MkSelect v-model="joinPolicy_" :disabled="!isOwner" :items="joinPolicyItems">
		<template #label>加入方式</template>
	</MkSelect>

	<MkSelect v-model="discoverability_" :disabled="!isOwner" :items="discoverabilityItems">
		<template #label>可发现性</template>
	</MkSelect>

	<MkInput v-model="maxMembers_" type="number" :disabled="!isOwner">
		<template #label>成员上限</template>
	</MkInput>

	<MkSwitch v-model="memberCanInvite_" :disabled="!isOwner">
		<template #label>允许成员邀请他人</template>
	</MkSwitch>

	<MkSwitch v-model="allowJoinRequest_" :disabled="!isOwner">
		<template #label>允许提交入群申请</template>
	</MkSwitch>

	<div v-if="isOwner" :class="$style.permissionGroup">
		<div :class="$style.permissionTitle">管理员权限</div>
		<div :class="$style.permissionHint">群主始终拥有全部权限，以下设置仅控制管理员可执行的操作。</div>
		<MkSwitch
			v-for="permission in adminPermissionItems"
			:key="permission.value"
			:modelValue="adminPermissions_.includes(permission.value)"
			@update:modelValue="toggleAdminPermission(permission.value, $event)"
		>
			<template #label>{{ permission.label }}</template>
		</MkSwitch>
	</div>

	<MkButton v-if="isOwner" primary @click="save">保存设置</MkButton>

	<hr v-if="canManageAnnouncement">

	<MkTextarea v-if="canManageAnnouncement" v-model="announcement_" :disabled="!canManageAnnouncement">
		<template #label>群公告</template>
	</MkTextarea>

	<MkButton v-if="canManageAnnouncement" primary @click="saveAnnouncement">保存群公告</MkButton>

	<hr v-if="canInvite">

	<div v-if="canInvite" class="_gaps">
		<div class="_buttons">
			<MkButton primary @click="createInviteLink"><i class="ti ti-link-plus"></i> 创建邀请链接</MkButton>
		</div>

		<div v-if="inviteLinks.length === 0" style="opacity: 0.7;">暂无邀请链接</div>

		<div v-for="inviteLink in inviteLinks" :key="inviteLink.id" :class="$style.inviteLink">
			<div :class="$style.inviteLinkBody">
				<div :class="$style.inviteLinkCode">{{ inviteLink.code }}</div>
				<div :class="$style.inviteLinkMeta">
					<span>{{ formatInviteLinkStatus(inviteLink) }}</span>
					<span v-if="inviteLink.maxUses != null">已使用 {{ inviteLink.uses }}/{{ inviteLink.maxUses }}</span>
					<span v-else>已使用 {{ inviteLink.uses }} 次</span>
					<span v-if="inviteLink.expiresAt">到期时间 <MkTime :time="inviteLink.expiresAt" mode="detail"/></span>
				</div>
			</div>

			<div :class="$style.inviteLinkActions">
				<MkButton rounded small @click="copyInviteLink(inviteLink)"><i class="ti ti-copy"></i> 复制</MkButton>
				<MkButton
					v-if="inviteLink.revokedAt == null"
					rounded
					small
					danger
					@click="revokeInviteLink(inviteLink)"
				><i class="ti ti-link-off"></i> 撤销</MkButton>
			</div>
		</div>
	</div>

	<hr>

	<MkButton v-if="isOwner || ($i.isAdmin || $i.isModerator)" danger @click="del">删除群聊</MkButton>

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
import { misskeyApi } from '@/utility/misskey-api.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { chooseDriveFile, createCroppedImageDriveFileFromImageDriveFile } from '@/utility/drive.js';
import { url } from '@@/js/config.js';
import MkTime from '@/components/global/MkTime.vue';
import {
	emitChatHomeInvalidated,
	emitChatRoomCollectionsInvalidated,
	emitChatRoomUpdated,
} from './state.js';

const router = useRouter();
const $i = ensureSignin();

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const emit = defineEmits<{
	(ev: 'updated', room: Misskey.entities.ChatRoom): void;
}>();

const isOwner = computed(() => {
	return props.room.ownerId === $i.id;
});
const canEditAvatar = computed(() => isOwner.value || props.room.myRole === 'admin');
const isJoined = computed(() => props.room.isJoined ?? false);
const canManageAnnouncement = computed(() => props.room.canManageAnnouncement ?? false);
const canInvite = computed(() => props.room.canInvite ?? false);

const name_ = ref('');
const description_ = ref('');
const announcement_ = ref('');
const avatarFileId_ = ref<string | null>(null);
const avatarUrl_ = ref<string | null>(null);
const joinPolicy_ = ref<Misskey.entities.ChatRoom['joinPolicy']>('invite_only');
const discoverability_ = ref<Misskey.entities.ChatRoom['discoverability']>('private');
const maxMembers_ = ref(50);
const memberCanInvite_ = ref(false);
const adminPermissions_ = ref<Misskey.entities.ChatRoom['adminPermissions']>([]);
const allowJoinRequest_ = ref(true);
const isMuted = ref(false);
const inviteLinks = ref<Misskey.entities.ChatRoomInviteLink[]>([]);
let syncingRoomState = false;

const joinPolicyItems: MkSelectItem<string>[] = [{
	value: 'invite_only',
	label: '仅邀请',
}, {
	value: 'request_required',
	label: '需申请审核',
}, {
	value: 'public',
	label: '公开可加入',
}];

const discoverabilityItems: MkSelectItem<string>[] = [{
	value: 'private',
	label: '私密',
}, {
	value: 'unlisted',
	label: '不公开（仅链接可见）',
}, {
	value: 'public',
	label: '公开可发现',
}];

const adminPermissionItems: {
	value: Misskey.entities.ChatRoom['adminPermissions'][number];
	label: string;
}[] = [{
	value: 'invite',
	label: '邀请成员',
}, {
	value: 'approve',
	label: '审批申请',
}, {
	value: 'kick',
	label: '移出成员',
}, {
	value: 'ban',
	label: '封禁成员',
}, {
	value: 'mute',
	label: '禁言成员',
}, {
	value: 'announcement',
	label: '管理群公告',
}, {
	value: 'pin',
	label: '置顶消息',
}];

watch(() => props.room, (room) => {
	syncingRoomState = true;
	name_.value = room.name;
	description_.value = room.description;
	announcement_.value = room.announcement;
	avatarFileId_.value = room.avatarFileId;
	avatarUrl_.value = room.avatarUrl;
	joinPolicy_.value = room.joinPolicy;
	discoverability_.value = room.discoverability;
	maxMembers_.value = room.maxMembers;
	memberCanInvite_.value = room.memberCanInvite;
	adminPermissions_.value = [...(room.adminPermissions ?? [])];
	allowJoinRequest_.value = room.allowJoinRequest;
	isMuted.value = room.isMuted ?? false;
	syncingRoomState = false;
}, {
	immediate: true,
});

watch(() => [props.room.id, canInvite.value] as const, async ([roomId, canInviteNow]) => {
	if (!canInviteNow) {
		inviteLinks.value = [];
		return;
	}

	inviteLinks.value = await misskeyApi('chat/rooms/invite-links/list', {
		roomId,
		limit: 50,
	});
}, {
	immediate: true,
});

async function save() {
	const updated = await os.apiWithDialog('chat/rooms/update-settings', {
		roomId: props.room.id,
		name: name_.value,
		description: description_.value,
		avatarFileId: avatarFileId_.value,
		joinPolicy: joinPolicy_.value,
		discoverability: discoverability_.value,
		memberCanInvite: memberCanInvite_.value,
		adminPermissions: adminPermissions_.value,
		allowJoinRequest: allowJoinRequest_.value,
		maxMembers: maxMembers_.value,
	});
	emit('updated', updated);
	emitChatRoomUpdated(updated.id, updated);
	emitChatRoomCollectionsInvalidated(updated.id, ['ownedRooms', 'joiningRooms']);
	emitChatHomeInvalidated({
		reason: 'room-settings-updated',
		roomId: updated.id,
		scopes: ['ownedRooms', 'joiningRooms'],
	});
}

async function saveAvatar() {
	const updated = await os.apiWithDialog('chat/rooms/update-settings', {
		roomId: props.room.id,
		avatarFileId: avatarFileId_.value,
	});
	emit('updated', updated);
	emitChatRoomUpdated(updated.id, updated);
	emitChatRoomCollectionsInvalidated(updated.id, ['ownedRooms', 'joiningRooms']);
	emitChatHomeInvalidated({
		reason: 'room-avatar-updated',
		roomId: updated.id,
		scopes: ['ownedRooms', 'joiningRooms'],
	});
}

function applyAvatar(driveFile: Misskey.entities.DriveFile) {
	avatarFileId_.value = driveFile.id;
	avatarUrl_.value = driveFile.thumbnailUrl ?? driveFile.url;
}

async function chooseAvatarFromPc() {
	const files = await os.chooseFileFromPc({ multiple: false });
	const file = files[0];
	if (!file) return;

	let originalOrCropped = file;

	const { canceled } = await os.confirm({
		type: 'question',
		text: i18n.ts.cropImageAsk,
		okText: i18n.ts.cropYes,
		cancelText: i18n.ts.cropNo,
	});

	if (!canceled) {
		originalOrCropped = await os.cropImageFile(file, {
			aspectRatio: 1,
		});
	}

	const [driveFile] = await os.launchUploader([originalOrCropped], { multiple: false });
	applyAvatar(driveFile);
}

async function chooseAvatarFromDrive() {
	const files = await chooseDriveFile({ multiple: false });
	const file = files[0];
	if (!file) return;

	const { canceled } = await os.confirm({
		type: 'question',
		text: i18n.ts.cropImageAsk,
		okText: i18n.ts.cropYes,
		cancelText: i18n.ts.cropNo,
	});

	const driveFile = canceled
		? file
		: await createCroppedImageDriveFileFromImageDriveFile(file, {
			aspectRatio: 1,
		});

	applyAvatar(driveFile);
}

function removeAvatar() {
	avatarFileId_.value = null;
	avatarUrl_.value = null;
}

function openAvatarMenu(ev: PointerEvent) {
	if (!canEditAvatar.value) return;

	os.popupMenu([{
		text: '群头像',
		type: 'label',
	}, {
		text: i18n.ts.upload,
		icon: 'ti ti-upload',
		action: () => {
			void chooseAvatarFromPc();
		},
	}, {
		text: i18n.ts.fromDrive,
		icon: 'ti ti-cloud',
		action: () => {
			void chooseAvatarFromDrive();
		},
	}, ...(avatarFileId_.value != null ? [{
		text: '移除头像',
		icon: 'ti ti-trash',
		danger: true,
		action: removeAvatar,
	}] : [])], ev.currentTarget ?? ev.target);
}

function toggleAdminPermission(permission: Misskey.entities.ChatRoom['adminPermissions'][number], enabled: boolean) {
	if (enabled) {
		if (!adminPermissions_.value.includes(permission)) {
			adminPermissions_.value = [...adminPermissions_.value, permission];
		}
		return;
	}

	adminPermissions_.value = adminPermissions_.value.filter(item => item !== permission);
}

async function saveAnnouncement() {
	const updated = await os.apiWithDialog('chat/rooms/update-announcement', {
		roomId: props.room.id,
		announcement: announcement_.value,
	});
	emit('updated', updated);
	emitChatRoomUpdated(updated.id, updated);
}

async function del() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: `确定要删除“${name_.value}”吗？`,
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/delete', {
		roomId: props.room.id,
	});
	emitChatRoomCollectionsInvalidated(props.room.id, ['ownedRooms', 'joiningRooms']);
	emitChatHomeInvalidated({
		reason: 'room-deleted',
		roomId: props.room.id,
		scopes: ['ownedRooms', 'joiningRooms', 'counts'],
	});
	router.push('/chat');
}

watch(isMuted, async () => {
	if (syncingRoomState) return;

	await os.apiWithDialog('chat/rooms/mute', {
		roomId: props.room.id,
		mute: isMuted.value,
	});
	emitChatRoomUpdated(props.room.id, {
		isMuted: isMuted.value,
	});
});

function formatInviteLinkStatus(inviteLink: Misskey.entities.ChatRoomInviteLink) {
	if (inviteLink.revokedAt != null) return '已撤销';
	if (inviteLink.expiresAt != null && new Date(inviteLink.expiresAt).getTime() <= Date.now()) return '已过期';
	if (inviteLink.maxUses != null && inviteLink.uses >= inviteLink.maxUses) return '次数已用尽';
	return '可用';
}

async function createInviteLink() {
	const expiresInDays = await os.inputText({
		title: '创建邀请链接',
		text: '有效期天数（留空表示永不过期）',
		placeholder: '例如 7',
	});
	if (expiresInDays.canceled) return;

	const maxUsesInput = await os.inputText({
		title: '创建邀请链接',
		text: '可使用次数（留空表示不限次数）',
		placeholder: '例如 20',
	});
	if (maxUsesInput.canceled) return;

	const expiresAtDays = expiresInDays.result ? Number.parseInt(expiresInDays.result, 10) : null;
	const maxUses = maxUsesInput.result ? Number.parseInt(maxUsesInput.result, 10) : null;

	if ((expiresInDays.result && (expiresAtDays == null || !Number.isFinite(expiresAtDays) || expiresAtDays <= 0)) || (maxUsesInput.result && (maxUses == null || !Number.isFinite(maxUses) || maxUses <= 0))) {
		await os.alert({
			type: 'warning',
			text: '请输入有效的正整数。',
		});
		return;
	}

	const inviteLink = await os.apiWithDialog('chat/rooms/invite-links/create', {
		roomId: props.room.id,
		...(expiresAtDays != null ? { expiresAt: Date.now() + (expiresAtDays as number) * 24 * 60 * 60 * 1000 } : {}),
		...(maxUses != null ? { maxUses: maxUses as number } : {}),
	});

	inviteLinks.value.unshift(inviteLink);
}

function copyInviteLink(inviteLink: Misskey.entities.ChatRoomInviteLink) {
	copyToClipboard(`${url}/chat/room/${props.room.id}?inviteCode=${inviteLink.code}`);
}

async function revokeInviteLink(inviteLink: Misskey.entities.ChatRoomInviteLink) {
	await os.apiWithDialog('chat/rooms/invite-links/revoke', {
		inviteLinkId: inviteLink.id,
	});
	inviteLinks.value = inviteLinks.value.map(item => item.id === inviteLink.id ? {
		...item,
		revokedAt: new Date().toISOString(),
	} : item);
}
</script>

<style lang="scss" module>
.avatarPanel {
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 16px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 18px;
}

.avatarPreview {
	width: 88px;
	height: 88px;
	flex-shrink: 0;
	border-radius: 24px;
	overflow: hidden;
	background: color-mix(in srgb, var(--MI_THEME-panel) 72%, var(--MI_THEME-bg) 28%);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 72%, transparent);
}

.avatarPreviewClickable {
	cursor: pointer;
	transition: transform 0.18s ease, border-color 0.18s ease;

	&:hover {
		transform: translateY(-1px);
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 36%, var(--MI_THEME-divider));
	}
}

.avatarImage,
.avatarFallback {
	width: 100%;
	height: 100%;
}

.avatarImage {
	display: block;
	object-fit: cover;
}

.avatarFallback {
	display: grid;
	place-items: center;
	font-size: 2rem;
	color: color-mix(in srgb, var(--MI_THEME-fg) 72%, transparent);
	background:
		radial-gradient(circle at top, color(from var(--MI_THEME-accent) srgb r g b / 0.18), transparent 60%),
		color-mix(in srgb, var(--MI_THEME-panel) 82%, var(--MI_THEME-bg) 18%);
}

.avatarMeta {
	min-width: 0;
	display: grid;
	gap: 6px;
}

.avatarTitle {
	font-size: 1rem;
	font-weight: 700;
}

.avatarHint {
	font-size: 0.9em;
	opacity: 0.75;
}

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

.inviteLink {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 14px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 16px;
}

.inviteLinkBody {
	flex: 1;
	min-width: 0;
}

.inviteLinkCode {
	font-family: monospace;
	font-size: 1rem;
	font-weight: 700;
}

.inviteLinkMeta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	margin-top: 6px;
	font-size: 0.9em;
	opacity: 0.75;
}

.inviteLinkActions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	justify-content: flex-end;
}

.permissionGroup {
	display: grid;
	gap: 10px;
	padding: 14px 16px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 16px;
}

.permissionTitle {
	font-weight: 700;
}

.permissionHint {
	font-size: 0.9em;
	opacity: 0.75;
}
</style>
