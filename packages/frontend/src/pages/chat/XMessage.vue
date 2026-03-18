<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.isMe]: isMe }]">
	<MkAvatar :class="[$style.avatar, prefer.s.useStickyIcons ? $style.useSticky : null]" :user="message.fromUser!" :link="!isMe" :preview="false"/>
	<div :class="[$style.body, message.file != null ? $style.fullWidth : null]" @contextmenu.stop="onContextmenu">
		<div :class="$style.header">
			<template v-if="showSenderHeader && message.fromUser != null">
				<MkUserName :class="$style.senderName" :user="message.fromUser"/>
				<MkAcct :class="$style.senderAcct" :user="message.fromUser"/>
				<div v-if="message.fromUser.badgeRoles?.length" :class="$style.badgeRoles">
					<img v-for="(role, i) in message.fromUser.badgeRoles" :key="i" v-tooltip="role.name" :class="$style.badgeRole" :src="role.iconUrl!" alt=""/>
				</div>
			</template>
		</div>
		<MkFukidashi :class="$style.fukidashi" :tail="isMe ? 'right' : 'left'" :fullWidth="message.file != null" :accented="isMe">
			<Mfm
				v-if="message.text"
				ref="text"
				class="_selectable"
				:text="message.text"
				:i="$i"
				:nyaize="'respect'"
				:enableEmojiMenu="true"
				:enableEmojiMenuReaction="true"
			/>
			<MkMediaList v-if="message.file" :mediaList="[message.file]"/>
		</MkFukidashi>
		<MkUrlPreview v-for="url in urls" :key="url" :url="url" style="margin: 8px 0;"/>
		<div :class="$style.footer">
			<button class="_textButton" style="color: currentColor;" @click="showMenu"><i class="ti ti-dots-circle-horizontal"></i></button>
			<MkTime :class="$style.time" :time="message.createdAt"/>
			<MkA v-if="isSearchResult && 'toRoom' in message && message.toRoom != null" :to="`/chat/room/${message.toRoomId}`">{{ message.toRoom.name }}</MkA>
			<MkA v-if="isSearchResult && 'toUser' in message && message.toUser != null && isMe" :to="`/chat/user/${message.toUserId}`">@{{ message.toUser.username }}</MkA>
		</div>
		<TransitionGroup
			:enterActiveClass="prefer.s.animation ? $style.transition_reaction_enterActive : ''"
			:leaveActiveClass="prefer.s.animation ? $style.transition_reaction_leaveActive : ''"
			:enterFromClass="prefer.s.animation ? $style.transition_reaction_enterFrom : ''"
			:leaveToClass="prefer.s.animation ? $style.transition_reaction_leaveTo : ''"
			:moveClass="prefer.s.animation ? $style.transition_reaction_move : ''"
			tag="div" :class="$style.reactions"
		>
			<div v-for="record in message.reactions" :key="record.reaction + record.user.id" :class="[$style.reaction, record.user.id === $i.id ? $style.reactionMy : null]" @click="onReactionClick(record)">
				<MkAvatar :user="record.user" :link="false" :class="$style.reactionAvatar"/>
				<MkReactionIcon
					:withTooltip="true"
					:reaction="record.reaction.replace(/^:(\w+):$/, ':$1@.:')"
					:noStyle="true"
					:class="$style.reactionIcon"
				/>
			</div>
		</TransitionGroup>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, provide } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import type { MenuItem } from '@/types/menu.js';
import type { NormalizedChatMessage } from './room.vue';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import MkFukidashi from '@/components/MkFukidashi.vue';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import MkMediaList from '@/components/MkMediaList.vue';
import { reactionPicker } from '@/utility/reaction-picker.js';
import * as sound from '@/utility/sound.js';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { getHTMLElementOrNull } from '@/utility/get-dom-node-or-null.js';
import MkAcct from '@/components/global/MkAcct.vue';

const $i = ensureSignin();

const props = defineProps<{
	message: NormalizedChatMessage | Misskey.entities.ChatMessage;
	isSearchResult?: boolean;
	allowPin?: boolean;
	isPinned?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'togglePin', messageId: string | null): void;
}>();

const isMe = computed(() => props.message.fromUserId === $i.id);
const isRoomMessage = computed(() => {
	return 'toRoomId' in props.message && props.message.toRoomId != null;
});
const showSenderHeader = computed(() => {
	if (props.message.fromUser == null) return false;
	if (isRoomMessage.value) return true;
	return !isMe.value && prefer.s['chat.showSenderName'];
});
const urls = computed(() => props.message.text ? extractUrlFromMfm(mfm.parse(props.message.text)) : []);

provide(DI.mfmEmojiReactCallback, (reaction) => {
	if ($i.policies.chatAvailability !== 'available') return;

	sound.playMisskeySfx('reaction');
	misskeyApi('chat/messages/react', {
		messageId: props.message.id,
		reaction: reaction,
	});
});

function react(ev: PointerEvent) {
	if ($i.policies.chatAvailability !== 'available') return;

	const targetEl = getHTMLElementOrNull(ev.currentTarget ?? ev.target);
	if (!targetEl) return;

	reactionPicker.show(targetEl, null, async (reaction) => {
		sound.playMisskeySfx('reaction');
		misskeyApi('chat/messages/react', {
			messageId: props.message.id,
			reaction: reaction,
		});
	});
}

function onReactionClick(record: Misskey.entities.ChatMessage['reactions'][0]) {
	if ($i.policies.chatAvailability !== 'available') return;

	if (record.user.id === $i.id) {
		misskeyApi('chat/messages/unreact', {
			messageId: props.message.id,
			reaction: record.reaction,
		});
	} else {
		if (!props.message.reactions.some(r => r.user.id === $i.id && r.reaction === record.reaction)) {
			sound.playMisskeySfx('reaction');
			misskeyApi('chat/messages/react', {
				messageId: props.message.id,
				reaction: record.reaction,
			});
		}
	}
}

function onContextmenu(ev: PointerEvent) {
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;

	showMenu(ev, true);
}

function showMenu(ev: PointerEvent, contextmenu = false) {
	const menu: MenuItem[] = [];

	if (!isMe.value && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: '回应',
			icon: 'ti ti-mood-plus',
			action: (ev) => {
				react(ev);
			},
		});

		menu.push({
			type: 'divider',
		});
	}

	menu.push({
		text: '复制内容',
		icon: 'ti ti-copy',
		action: () => {
			copyToClipboard(props.message.text ?? '');
		},
	});

	menu.push({
		type: 'divider',
	});

	if (props.allowPin && isRoomMessage.value) {
		menu.push({
			text: props.isPinned ? '取消置顶' : '置顶消息',
			icon: props.isPinned ? 'ti ti-pin-off' : 'ti ti-pin',
			action: () => {
				emit('togglePin', props.isPinned ? null : props.message.id);
			},
		});

		menu.push({
			type: 'divider',
		});
	}

	if (isMe.value && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: '删除消息',
			icon: 'ti ti-trash',
			danger: true,
			action: () => {
				misskeyApi('chat/messages/delete', {
					messageId: props.message.id,
				});
			},
		});
	}

	if (!isMe.value && props.message.fromUser != null) {
		menu.push({
			text: '举报',
			icon: 'ti ti-exclamation-circle',
			action: async () => {
				const localUrl = `${url}/chat/messages/${props.message.id}`;
				const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkAbuseReportWindow.vue').then(x => x.default), {
					user: props.message.fromUser!,
					initialComment: `${localUrl}\n-----\n`,
				}, {
					closed: () => dispose(),
				});
			},
		});
	}

	if (contextmenu) {
		os.contextMenu(menu, ev);
	} else {
		os.popupMenu(menu, ev.currentTarget ?? ev.target);
	}
}
</script>

<style lang="scss" module>
.transition_reaction_move,
.transition_reaction_enterActive,
.transition_reaction_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_reaction_enterFrom,
.transition_reaction_leaveTo {
	opacity: 0;
	transform: scale(0.7);
}
.transition_reaction_leaveActive {
	position: absolute;
}

.root {
	position: relative;
	display: flex;

	&.isMe {
		flex-direction: row-reverse;
		text-align: right;

		.footer {
			flex-direction: row-reverse;
		}
	}
}

.avatar {
	display: block;
	width: 50px;
	height: 50px;

	&.useSticky {
		position: sticky;
		top: calc(16px + var(--MI-stickyTop, 0px));
	}
}

@container (max-width: 450px) {
	.avatar {
		width: 42px;
		height: 42px;
	}

	.fukidashi {
		font-size: 90%;
	}
}

.body {
	margin: 0 12px;

	&.fullWidth {
		width: 100%;
	}
}

.header {
	min-height: 4px; // fukidashiの位置調整も兼ねるため
	font-size: 80%;
	display: flex;
	align-items: center;
	gap: 0.5em;
}

.senderName {
	font-weight: 700;
}

.senderAcct {
	opacity: 0.8;
}

.badgeRoles {
	display: flex;
	align-items: center;
	gap: 0.2em;
}

.badgeRole {
	height: 1.2em;
	vertical-align: -20%;
}

.fukidashi {
	text-align: left;
}

.content {
	overflow: clip;
	overflow-wrap: break-word;
	word-break: break-word;
}

.footer {
	display: flex;
	flex-direction: row;
	gap: 0.5em;
	margin-top: 4px;
	font-size: 75%;
}

.time {
	opacity: 0.5;
}

.reactions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-top: 8px;

	&:empty {
		display: none;
	}
}

.reaction {
	display: flex;
	align-items: center;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 999px;
	padding: 8px;

	&.reactionMy {
		border-color: var(--MI_THEME-accent);
	}
}

.reactionAvatar {
	width: 24px;
	height: 24px;
	margin-right: 8px;
}

.reactionIcon {
	width: 24px;
	height: 24px;
}
</style>
