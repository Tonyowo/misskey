<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :reversed="tab === 'chat'" :tabs="headerTabs" :actions="headerActions">
	<div v-if="tab === 'chat'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<div class="_gaps">
			<div v-if="!initializing && room?.isJoined && (room.announcement || pinnedMessage)" class="_gaps">
				<MkInfo v-if="room.announcement">{{ room.announcement }}</MkInfo>

				<div v-if="pinnedMessage" :class="$style.pinnedBox">
					<div :class="$style.pinnedTitle"><i class="ti ti-pin"></i> 置顶消息</div>
					<XMessage
						:message="pinnedMessage"
						:allowPin="room?.canManageMembers ?? false"
						:isPinned="true"
						@togglePin="togglePinnedMessage"
					/>
				</div>
			</div>

			<div v-if="initializing">
				<MkLoading/>
			</div>

			<div v-else-if="room && !room.isJoined">
				<div class="_gaps" style="text-align: center;">
					<div>{{ i18n.ts._chat.youAreNotAMemberOfThisRoom }}</div>
					<div v-if="room.description" :class="$style.roomDescription">{{ room.description }}</div>
					<MkInfo v-if="room.joinRequestExists">
						{{ i18n.ts._chat.joinRequestPending }}
					</MkInfo>
					<div :class="$style.roomActions">
						<MkButton
							v-if="room.joinPolicy === 'public'"
							primary
							rounded
							:disabled="$i.policies.chatAvailability !== 'available'"
							@click="joinRoomDirectly"
						>
							<i class="ti ti-plus"></i> 加入群聊
						</MkButton>
						<MkButton
							v-else-if="!room.joinRequestExists && room.allowJoinRequest && room.joinPolicy !== 'invite_only'"
							primary
							rounded
							:disabled="$i.policies.chatAvailability !== 'available'"
							@click="requestToJoinRoom"
						>
							<i class="ti ti-user-plus"></i> 申请加入
						</MkButton>
						<MkButton
							v-else
							rounded
							@click="cancelJoinRequest"
						>
							<i class="ti ti-x"></i> 取消申请
						</MkButton>
					</div>
				</div>
			</div>

			<div v-else-if="messages.length === 0">
				<div class="_gaps" style="text-align: center;">
					<div>{{ i18n.ts._chat.noMessagesYet }}</div>
					<template v-if="user">
						<div v-if="user.chatScope === 'followers'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowers }}</div>
						<div v-else-if="user.chatScope === 'following'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowing }}</div>
						<div v-else-if="user.chatScope === 'mutual'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromMutualFollowing }}</div>
						<div v-else-if="user.chatScope === 'none'">{{ i18n.ts._chat.thisUserNotAllowedChatAnyone }}</div>
					</template>
					<template v-else-if="room">
						<div>{{ i18n.ts._chat.inviteUserToChat }}</div>
					</template>
				</div>
			</div>

			<div v-else ref="timelineEl" class="_gaps">
				<div v-if="canFetchMore">
					<MkButton :class="$style.more" :wait="moreFetching" primary rounded @click="fetchMore">加载更多</MkButton>
				</div>

				<TransitionGroup
					:enterActiveClass="prefer.s.animation ? $style.transition_x_enterActive : ''"
					:leaveActiveClass="prefer.s.animation ? $style.transition_x_leaveActive : ''"
					:enterFromClass="prefer.s.animation ? $style.transition_x_enterFrom : ''"
					:leaveToClass="prefer.s.animation ? $style.transition_x_leaveTo : ''"
					:moveClass="prefer.s.animation ? $style.transition_x_move : ''"
					tag="div" class="_gaps"
				>
					<template v-for="item in timeline.toReversed()" :key="item.id">
						<XMessage
							v-if="item.type === 'item'"
							:message="item.data"
							:allowPin="room?.canManageMembers ?? false"
							:isPinned="room?.pinnedMessageId === item.data.id"
							@togglePin="togglePinnedMessage"
						/>
						<div v-else-if="item.type === 'date'" :class="$style.dateDivider">
							<span><i class="ti ti-chevron-up"></i> {{ item.nextText }}</span>
							<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
							<span>{{ item.prevText }} <i class="ti ti-chevron-down"></i></span>
						</div>
					</template>
				</TransitionGroup>
			</div>

			<div v-if="user && (!user.canChat || user.host !== null)">
				<MkInfo warn>{{ i18n.ts._chat.chatNotAvailableInOtherAccount }}</MkInfo>
			</div>

			<MkInfo v-if="$i.policies.chatAvailability !== 'available'" warn>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
		</div>
	</div>

	<div v-else-if="tab === 'search'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XSearch :userId="userId" :roomId="roomId"/>
	</div>

	<div v-else-if="tab === 'members'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XMembers v-if="room != null" :room="room" @inviteUser="inviteUser" @updated="onRoomUpdated"/>
	</div>

	<div v-else-if="tab === 'info'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XInfo v-if="room != null" :room="room" @updated="onRoomUpdated"/>
	</div>

	<template #footer>
		<div v-if="tab === 'chat' && canUseChatForm" :class="$style.footer">
			<div class="_gaps">
				<Transition name="fade">
					<div v-show="showIndicator" :class="$style.new">
						<button class="_buttonPrimary" :class="$style.newButton" @click="onIndicatorClick">
							<i class="fas ti-fw fa-arrow-circle-down" :class="$style.newIcon"></i>{{ i18n.ts._chat.newMessage }}
						</button>
					</div>
				</Transition>
				<XForm v-if="initialized" :user="user" :room="room" :class="$style.form"/>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, onMounted, onBeforeUnmount, onDeactivated, onActivated, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { getScrollContainer } from '@@/js/scroll.js';
import XMessage from './XMessage.vue';
import XForm from './room.form.vue';
import XSearch from './room.search.vue';
import XMembers from './room.members.vue';
import XInfo from './room.info.vue';
import type { MenuItem } from '@/types/menu.js';
import type { PageHeaderItem } from '@/types/page-header.js';
import * as os from '@/os.js';
import { useStream } from '@/stream.js';
import * as sound from '@/utility/sound.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { prefer } from '@/preferences.js';
import MkButton from '@/components/MkButton.vue';
import { useRouter } from '@/router.js';
import { useMutationObserver } from '@/composables/use-mutation-observer.js';
import MkInfo from '@/components/MkInfo.vue';
import { makeDateSeparatedTimelineComputedRef } from '@/utility/timeline-date-separate.js';

const $i = ensureSignin();
const router = useRouter();

const props = defineProps<{
	userId?: string;
	roomId?: string;
	inviteCode?: string;
}>();

export type NormalizedChatMessage = Omit<Misskey.entities.ChatMessageLite, 'fromUser' | 'reactions'> & {
	fromUser: Misskey.entities.UserLite;
	reactions: (Misskey.entities.ChatMessageLite['reactions'][number] & {
		user: Misskey.entities.UserLite;
	})[];
};

const initializing = ref(false);
const initialized = ref(false);
const moreFetching = ref(false);
const messages = ref<NormalizedChatMessage[]>([]);
const canFetchMore = ref(false);
const user = ref<Misskey.entities.UserDetailed | null>(null);
const room = ref<Misskey.entities.ChatRoom | null>(null);
const pinnedMessage = ref<Misskey.entities.ChatMessage | null>(null);
const connection = ref<Misskey.IChannelConnection<Misskey.Channels['chatUser']> | Misskey.IChannelConnection<Misskey.Channels['chatRoom']> | null>(null);
const showIndicator = ref(false);
const timelineEl = useTemplateRef('timelineEl');
const timeline = makeDateSeparatedTimelineComputedRef(messages);
const isJoinedRoom = computed(() => room.value?.isJoined ?? false);
const canUseChatForm = computed(() => user.value != null || isJoinedRoom.value);
const handledInviteCodeKey = ref<string | null>(null);

const SCROLL_HEAD_THRESHOLD = 200;

// column-reverseなので本来はスクロール位置の最下部への追従は不要なはずだが、おそらくブラウザのバグにより、最下部にスクロールした状態でも追従されない場合がある(スクロール位置が少数になることがあるのが関わっていそう)
// そのため補助としてMutationObserverを使って追従を行う
useMutationObserver(timelineEl, {
	subtree: true,
	childList: true,
	attributes: false,
}, () => {
	const scrollContainer = getScrollContainer(timelineEl.value)!;
	// column-reverseなのでscrollTopは負になる
	if (-scrollContainer.scrollTop < SCROLL_HEAD_THRESHOLD) {
		scrollContainer.scrollTo({
			top: 0,
			behavior: 'instant',
		});
	}
});

function normalizeMessage(message: Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage): NormalizedChatMessage {
	return {
		...message,
		fromUser: message.fromUser ?? (message.fromUserId === $i.id ? $i : user.value!),
		reactions: message.reactions.map(record => ({
			...record,
			user: record.user ?? (message.fromUserId === $i.id ? user.value! : $i),
		})),
	};
}

async function initialize() {
	const LIMIT = 20;

	if (initializing.value) return;

	initializing.value = true;
	initialized.value = false;
	canFetchMore.value = false;
	user.value = null;
	room.value = null;
	pinnedMessage.value = null;
	messages.value = [];
	showIndicator.value = false;
	connection.value?.dispose();
	connection.value = null;
	window.document.removeEventListener('visibilitychange', onVisibilitychange);

	if (props.userId) {
		const [u, m] = await Promise.all([
			misskeyApi('users/show', { userId: props.userId }),
			misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit: LIMIT }),
		]);

		user.value = u;
		messages.value = m.map(x => normalizeMessage(x));

		if (messages.value.length === LIMIT) {
			canFetchMore.value = true;
		}

		connection.value = useStream().useChannel('chatUser', {
			otherId: user.value.id,
		});
		connection.value.on('message', onMessage);
		connection.value.on('deleted', onDeleted);
		connection.value.on('react', onReact);
		connection.value.on('unreact', onUnreact);
	} else if (props.roomId) {
		const [rResult, mResult] = await Promise.allSettled([
			misskeyApi('chat/rooms/show', { roomId: props.roomId }),
			misskeyApi('chat/messages/room-timeline', { roomId: props.roomId, limit: LIMIT }),
		]);

		if (rResult.status === 'rejected') {
			os.alert({
				type: 'error',
				text: '加载群聊失败。',
			});
			initializing.value = false;
			return;
		}

		const r = rResult.value as Misskey.entities.ChatRoomsShowResponse;

		if (props.inviteCode && !r.isJoined) {
			const inviteKey = `${r.id}:${props.inviteCode}`;
			if (handledInviteCodeKey.value !== inviteKey) {
				handledInviteCodeKey.value = inviteKey;
				try {
					await os.apiWithDialog('chat/rooms/invite-links/use', {
						code: props.inviteCode,
						roomId: r.id,
					}, undefined, {
						'84af6cb9-e7e1-4855-aefc-c6441c4e9836': {
							title: r.name,
							text: '邀请链接无效、已失效或已被撤销。',
						},
						'85ae18cb-d955-4487-a181-b5d7d0915687': {
							title: r.name,
							text: '群成员已达上限。',
						},
						'6ea4ef33-0e90-44f7-af68-21cece7f69e4': {
							title: r.name,
							text: '你已被该群封禁，无法通过邀请链接加入。',
						},
					});

					initializing.value = false;
					await initialize();
					return;
				} catch {
					// Keep showing the room details so the user can still understand the current state.
				}
			}
		}

		if (r.invitationExists) {
			const confirm = await os.confirm({
				type: 'question',
				title: r.name,
				text: '你已收到这个群聊的邀请。\n是否现在加入？',
			});
			if (confirm.canceled) {
				initializing.value = false;
				router.push('/chat');
				return;
			} else {
				await os.apiWithDialog('chat/rooms/join', { roomId: r.id });
				initializing.value = false;
				initialize();
				return;
			}
		}

		const m = mResult.status === 'fulfilled' ? mResult.value as Misskey.entities.ChatMessagesRoomTimelineResponse : [];

		room.value = r;
		messages.value = m.map(x => normalizeMessage(x));

		if (room.value.isJoined && messages.value.length === LIMIT) {
			canFetchMore.value = true;
		}

		if (room.value.isJoined) {
			await loadPinnedMessage();

			connection.value = useStream().useChannel('chatRoom', {
				roomId: room.value.id,
			});
			connection.value.on('message', onMessage);
			connection.value.on('deleted', onDeleted);
			connection.value.on('react', onReact);
			connection.value.on('unreact', onUnreact);
		}
	}

	window.document.addEventListener('visibilitychange', onVisibilitychange);

	initialized.value = true;
	initializing.value = false;
}

let isActivated = true;

onActivated(() => {
	isActivated = true;
});

onDeactivated(() => {
	isActivated = false;
});

async function fetchMore() {
	const LIMIT = 30;

	moreFetching.value = true;

	const newMessages = props.userId ? await misskeyApi('chat/messages/user-timeline', {
		userId: user.value!.id,
		limit: LIMIT,
		untilId: messages.value[messages.value.length - 1].id,
	}) : await misskeyApi('chat/messages/room-timeline', {
		roomId: room.value!.id,
		limit: LIMIT,
		untilId: messages.value[messages.value.length - 1].id,
	});

	messages.value.push(...newMessages.map(x => normalizeMessage(x)));

	canFetchMore.value = newMessages.length === LIMIT;
	moreFetching.value = false;
}

async function loadPinnedMessage() {
	if (room.value == null || !room.value.isJoined || room.value.pinnedMessageId == null) {
		pinnedMessage.value = null;
		return;
	}

	try {
		pinnedMessage.value = await misskeyApi('chat/messages/show', {
			messageId: room.value.pinnedMessageId,
		});
	} catch {
		pinnedMessage.value = null;
	}
}

function onMessage(message: Misskey.entities.ChatMessageLite) {
	sound.playMisskeySfx('chatMessage');

	messages.value.unshift(normalizeMessage(message));

	// TODO: DOM的にバックグラウンドになっていないかどうかも考慮する
	if (message.fromUserId !== $i.id && !window.document.hidden && isActivated) {
		connection.value?.send('read', {
			id: message.id,
		});
	}

	if (message.fromUserId !== $i.id) {
		//notifyNewMessage();
	}
}

function onDeleted(id: string) {
	const index = messages.value.findIndex(m => m.id === id);
	if (index !== -1) {
		messages.value.splice(index, 1);
	}
}

function onReact(ctx: Parameters<Misskey.Channels['chatUser']['events']['react']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['react']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (message) {
		if (room.value == null) { // 1on1の時はuserは省略される
			message.reactions.push({
				reaction: ctx.reaction,
				user: message.fromUserId === $i.id ? user.value! : $i,
			});
		} else {
			message.reactions.push({
				reaction: ctx.reaction,
				user: ctx.user!,
			});
		}
	}
}

function onUnreact(ctx: Parameters<Misskey.Channels['chatUser']['events']['unreact']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['unreact']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (message) {
		const index = message.reactions.findIndex(r => r.reaction === ctx.reaction && r.user.id === ctx.user!.id);
		if (index !== -1) {
			message.reactions.splice(index, 1);
		}
	}
}

function onIndicatorClick() {
	showIndicator.value = false;
}

function onVisibilitychange() {
	if (window.document.hidden) return;
	// TODO
}

onMounted(() => {
	initialize();
});

onActivated(() => {
	if (!initialized.value) {
		initialize();
	}
});

onBeforeUnmount(() => {
	connection.value?.dispose();
	window.document.removeEventListener('visibilitychange', onVisibilitychange);
});

async function inviteUser(onInvited?: () => Promise<void> | void) {
	if (room.value == null) return;

	const invitee = await os.selectUser({ includeSelf: false, localOnly: true });
	await os.apiWithDialog('chat/rooms/invitations/create', {
		roomId: room.value.id,
		userId: invitee.id,
	}, undefined, {
		'cf4f7a0e-18fe-46b5-b768-9950defa1681': {
			title: '邀请成员',
			text: '该用户已经收到过这个群聊的邀请。',
		},
		'09d36d36-2eff-49cf-ad9c-714f2f22f061': {
			title: '邀请成员',
			text: '该用户已经在这个群聊中。',
		},
		'2fe10100-3628-4960-a8ca-2d7f1996758f': {
			title: '邀请成员',
			text: '群成员已达上限。',
		},
		'f24758f4-d12e-47f9-86d2-95a4d1c78029': {
			title: '邀请成员',
			text: '不能邀请自己。',
		},
	});

	await onInvited?.();
}

async function requestToJoinRoom() {
	if (room.value == null || room.value.isJoined) return;

	const { canceled, result } = await os.inputText({
		title: '申请加入群聊',
		text: '申请理由（选填）',
		maxLength: 1024,
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/requests/create', {
		roomId: room.value.id,
		message: result ?? undefined,
	}, undefined, {
		'41333c6f-0e26-46d7-8f2b-c47f714b4d87': {
			title: '申请加入群聊',
			text: '不能向自己创建的群聊提交申请。',
		},
		'b304846f-e151-434c-88a5-f3961473f679': {
			title: '申请加入群聊',
			text: '你已经在这个群聊中。',
		},
		'e4c83205-738b-4ee5-89fc-7c0b7081e609': {
			title: '申请加入群聊',
			text: '你已经收到该群聊邀请，无需重复申请。',
		},
		'7d49d89f-e6d3-4601-a337-5afee4c5501c': {
			title: '申请加入群聊',
			text: '你的入群申请正在处理中。',
		},
	});

	room.value = {
		...room.value,
		joinRequestExists: true,
	};
}

async function joinRoomDirectly() {
	if (room.value == null || room.value.isJoined) return;

	await os.apiWithDialog('chat/rooms/join', {
		roomId: room.value.id,
	});
	initialize();
}

async function cancelJoinRequest() {
	if (room.value == null || room.value.isJoined || !room.value.joinRequestExists) return;

	await os.apiWithDialog('chat/rooms/requests/cancel', {
		roomId: room.value.id,
	});

	room.value = {
		...room.value,
		joinRequestExists: false,
	};
}

async function leaveRoom() {
	if (room.value == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: '确定要退出这个群聊吗？',
	});
	if (canceled) return;

	await misskeyApi('chat/rooms/leave', {
		roomId: room.value.id,
	});
	router.push('/chat');
}

async function togglePinnedMessage(messageId: string | null) {
	if (room.value == null) return;

	const updated = await os.apiWithDialog('chat/rooms/pin-message', {
		roomId: room.value.id,
		messageId,
	});
	room.value = updated;
	await loadPinnedMessage();
}

function onRoomUpdated(updated: Misskey.entities.ChatRoom) {
	room.value = updated;
}

function showMenu(ev: PointerEvent) {
	const menuItems: MenuItem[] = [];

	if (room.value) {
		if (room.value.canInvite) {
			menuItems.push({
				text: '邀请成员',
				icon: 'ti ti-user-plus',
				action: () => {
					inviteUser();
				},
			});
		}

		if (room.value.isJoined && room.value.ownerId !== $i.id) {
			menuItems.push({
				text: '退出群聊',
				icon: 'ti ti-x',
				action: () => {
					leaveRoom();
				},
			});
		}
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

const tab = ref('chat');

const headerTabs = computed(() => room.value ? [{
	key: 'chat',
	title: '消息',
	icon: 'ti ti-messages',
}, ...(room.value.isJoined ? [{
	key: 'members',
	title: '成员',
	icon: 'ti ti-users',
}, {
	key: 'search',
	title: '搜索',
	icon: 'ti ti-search',
}] : []), {
	key: 'info',
	title: '设置',
	icon: 'ti ti-info-circle',
}] : [{
	key: 'chat',
	title: '消息',
	icon: 'ti ti-messages',
}, {
	key: 'search',
	title: '搜索',
	icon: 'ti ti-search',
}]);

watch(headerTabs, () => {
	if (!headerTabs.value.some(headerTab => headerTab.key === tab.value)) {
		tab.value = 'chat';
	}
}, {
	immediate: true,
});

const headerActions = computed<PageHeaderItem[]>(() => room.value && room.value.isJoined ? [{
	icon: 'ti ti-dots',
	handler: showMenu,
}] : []);

watch(() => [room.value?.id, room.value?.isJoined, room.value?.pinnedMessageId] as const, () => {
	loadPinnedMessage();
}, {
	immediate: true,
});

definePage(computed(() => {
	if (initialized.value) {
		if (user.value) {
			return {
				userName: user.value,
				title: user.value.name ?? user.value.username,
				avatar: user.value,
			};
		} else if (room.value) {
			return {
				title: room.value.name,
				icon: 'ti ti-users',
			};
		} else {
			return {
				title: '聊天',
			};
		}
	} else {
		return {
			title: '聊天',
		};
	}
}));
</script>

<style lang="scss" module>
.transition_x_move,
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	opacity: 0;
	transform: translateY(80px);
}
.transition_x_leaveActive {
	position: absolute;
}

.root {
}

.more {
	margin: 0 auto;
}

.footer {
	width: 100%;
	padding-top: 8px;
}

.new {
	width: 100%;
	padding-bottom: 8px;
	text-align: center;
}

.newButton {
	display: inline-block;
	margin: 0;
	padding: 0 12px;
	line-height: 32px;
	font-size: 12px;
	border-radius: 16px;
}

.newIcon {
	display: inline-block;
	margin-right: 8px;
}

.footer {

}

.roomDescription {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.roomActions {
	display: flex;
	justify-content: center;
}

.pinnedBox {
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 18px;
	padding: 16px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-accent) 8%);
}

.pinnedTitle {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 12px;
	font-weight: 700;
	color: var(--MI_THEME-accent);
}

.form {
	margin: 0 auto;
	width: 100%;
	max-width: 700px;
}

.fade-enter-active, .fade-leave-active {
	transition: opacity 0.1s;
}

.fade-enter-from, .fade-leave-to {
	transition: opacity 0.5s;
	opacity: 0;
}

.dateDivider {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	opacity: 0.75;
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: 999px;
	width: fit-content;
	padding: 0.5em 1em;
	margin: 0 auto;
}
</style>
