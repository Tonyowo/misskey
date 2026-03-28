<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkA :to="`/chat/room/${room.id}`" class="_panel _gaps_s" :class="$style.root">
	<div :class="$style.header">
		<div :class="$style.roomAvatar">
			<img v-if="room.avatarUrl" :src="room.avatarUrl" :class="$style.roomAvatarImage" alt="">
			<div v-else :class="$style.roomAvatarFallback">
				<i class="ti ti-users-group"></i>
			</div>
		</div>
		<div :class="$style.titleBlock">
			<div :class="$style.title">{{ room.name }}</div>
			<div :class="$style.metaLine">
				<span>群主 {{ room.owner.name ?? room.owner.username }}</span>
				<span>{{ room.memberCount }} 人</span>
			</div>
		</div>
	</div>
	<div v-if="room.description" :class="$style.description">{{ room.description }}</div>
	<div :class="$style.badges">
		<div :class="$style.badge">{{ joinPolicyLabel }}</div>
		<div :class="$style.badge">{{ discoverabilityLabel }}</div>
		<div v-if="room.isJoined" :class="[$style.badge, $style.stateJoined]">已加入</div>
		<div v-else-if="room.invitationExists" :class="[$style.badge, $style.stateInvited]">已邀请</div>
		<div v-else-if="room.joinRequestExists" :class="[$style.badge, $style.stateRequested]">已申请</div>
		<div v-if="(room.pendingRequestCount ?? 0) > 0" :class="[$style.badge, $style.statePending]">待处理 {{ room.pendingRequestCount }}</div>
	</div>
</MkA>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const joinPolicyLabel = computed(() => {
	switch (props.room.joinPolicy) {
		case 'invite_only': return '仅邀请';
		case 'request_required': return '需申请';
		case 'public': return '公开加入';
		default: return '仅邀请';
	}
});

const discoverabilityLabel = computed(() => {
	switch (props.room.discoverability) {
		case 'private': return '私密';
		case 'unlisted': return '不公开';
		case 'public': return '公开可发现';
		default: return '私密';
	}
});
</script>

<style lang="scss" module>
.root {
	padding: 16px;
	display: block;
	text-decoration: none;
	border-radius: 18px;
	background:
		radial-gradient(circle at top right, color(from var(--MI_THEME-accent) srgb r g b / 0.12), transparent 38%),
		linear-gradient(
			180deg,
			color-mix(in srgb, var(--MI_THEME-panel) 96%, var(--MI_THEME-bg) 4%),
			color-mix(in srgb, var(--MI_THEME-panel) 88%, var(--MI_THEME-bg) 12%)
		);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 72%, transparent);
	box-shadow: 0 10px 24px color(from var(--MI_THEME-shadow) srgb r g b / 0.10);
	transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;

	&:hover {
		text-decoration: none;
		transform: translateY(-1px);
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 24%, var(--MI_THEME-divider));
		box-shadow: 0 14px 30px color(from var(--MI_THEME-shadow) srgb r g b / 0.14);
	}
}

.header {
	display: flex;
	align-items: center;
	gap: 12px;
}

.roomAvatar {
	width: 48px;
	height: 48px;
	flex-shrink: 0;
	border-radius: 16px;
	overflow: hidden;
	box-shadow: 0 0 0 3px color(from var(--MI_THEME-panel) srgb r g b / 0.9);
}

.roomAvatarImage,
.roomAvatarFallback {
	width: 100%;
	height: 100%;
}

.roomAvatarImage {
	display: block;
	object-fit: cover;
}

.roomAvatarFallback {
	display: grid;
	place-items: center;
	font-size: 1.35rem;
	color: color-mix(in srgb, var(--MI_THEME-fg) 72%, transparent);
	background:
		radial-gradient(circle at top, color(from var(--MI_THEME-accent) srgb r g b / 0.22), transparent 60%),
		color-mix(in srgb, var(--MI_THEME-panel) 82%, var(--MI_THEME-bg) 18%);
}

.titleBlock {
	min-width: 0;
	flex: 1;
}

.title {
	font-weight: 700;
	font-size: 1rem;
	line-height: 1.3;
	color: color-mix(in srgb, var(--MI_THEME-fg) 92%, var(--MI_THEME-accent) 8%);
}

.metaLine {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	margin-top: 4px;
	font-size: 0.85rem;
	color: color-mix(in srgb, var(--MI_THEME-fg) 72%, transparent);
}

.description {
	margin-top: 12px;
	font-size: 0.92rem;
	line-height: 1.5;
	color: color-mix(in srgb, var(--MI_THEME-fg) 84%, transparent);
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.badges {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 14px;
}

.badge {
	padding: 6px 10px;
	border-radius: 999px;
	font-size: 0.78rem;
	line-height: 1;
	background: color-mix(in srgb, var(--MI_THEME-bg) 76%, var(--MI_THEME-panel) 24%);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 80%, transparent);
}

.stateJoined {
	color: var(--MI_THEME-accent);
}

.stateInvited {
	color: #e58a00;
}

.stateRequested {
	color: #2a7bd6;
}

.statePending {
	color: #c43d2f;
}
</style>
