<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkA :to="`/chat/room/${room.id}`" class="_panel _gaps_s" :class="$style.root">
	<div :class="$style.header">
		<div :class="$style.titleBlock">
			<div :class="$style.title">{{ room.name }}</div>
			<div :class="$style.metaLine">
				<span>群主 {{ room.owner.name ?? room.owner.username }}</span>
				<span>{{ room.memberCount }} 人</span>
			</div>
		</div>
		<MkAvatar :user="room.owner" :link="false" :class="$style.headerAvatar"/>
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
		radial-gradient(circle at top right, color(from var(--MI_THEME-accent) srgb r g b / 0.10), transparent 36%),
		linear-gradient(180deg, color(from var(--MI_THEME-panel) srgb r g b / 1), color(from var(--MI_THEME-panel) srgb calc(r - 8) calc(g - 8) calc(b - 8) / 1));
}

.header {
	display: flex;
	align-items: center;
	gap: 12px;
}

.headerAvatar {
	width: 42px;
	height: 42px;
}

.titleBlock {
	min-width: 0;
	flex: 1;
}

.title {
	font-weight: 700;
	font-size: 1rem;
	line-height: 1.3;
}

.metaLine {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	margin-top: 4px;
	font-size: 0.85rem;
	opacity: 0.75;
}

.description {
	margin-top: 12px;
	font-size: 0.92rem;
	line-height: 1.5;
	opacity: 0.9;
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
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.8);
	border: solid 1px color(from var(--MI_THEME-divider) srgb r g b / 0.7);
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
