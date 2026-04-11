<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkButton v-if="$i.policies.chatAvailability === 'available'" primary gradate rounded :class="$style.start" @click="start"><i class="ti ti-plus"></i> 开始聊天</MkButton>

	<MkInfo v-else>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>

	<MkAd :preferForms="['horizontal', 'horizontal-big']"/>

	<MkInput
		v-model="searchQuery"
		placeholder="搜索消息"
		type="search"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<MkButton v-if="searchQuery.length > 0" primary rounded @click="search">搜索</MkButton>

	<div :class="$style.filters">
		<button
			v-for="item in filterItems"
			:key="item.value"
			class="_button"
			:class="[$style.filterChip, currentFilter === item.value ? $style.filterChipActive : null]"
			@click="currentFilter = item.value"
		>
			{{ item.label }}
		</button>
	</div>

	<MkFoldableSection v-if="searched">
		<template #header>搜索结果</template>

		<div class="_gaps_s">
			<div v-for="message in searchResults" :key="message.id" :class="$style.searchResultItem">
				<XMessage :message="message" :isSearchResult="true"/>
			</div>
		</div>
	</MkFoldableSection>

	<MkFoldableSection>
		<template #header>历史会话</template>

		<MkChatHistories :filter="currentFilter"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import type { ChatConversationFilter } from './history-items.js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { ensureSignin } from '@/i.js';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import MkInput from '@/components/MkInput.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkChatHistories from '@/components/MkChatHistories.vue';

const $i = ensureSignin();

const router = useRouter();

const searchQuery = ref('');
const searched = ref(false);
const searchResults = ref<Misskey.entities.ChatMessage[]>([]);
const currentFilter = ref<ChatConversationFilter>('all');

const filterItems: { value: ChatConversationFilter; label: string }[] = [{
	value: 'all',
	label: '全部',
}, {
	value: 'unread',
	label: '未读',
}, {
	value: 'direct',
	label: '私聊',
}, {
	value: 'group',
	label: '群聊',
}];

function start(ev: PointerEvent) {
	os.popupMenu([{
		text: '单人聊天',
		caption: i18n.ts._chat.individualChat_description,
		icon: 'ti ti-user',
		action: () => { startUser(); },
	}, { type: 'divider' }, {
		type: 'parent',
		text: '群聊',
		caption: i18n.ts._chat.roomChat_description,
		icon: 'ti ti-users-group',
		children: [{
			text: '创建群聊',
			icon: 'ti ti-plus',
			action: () => { createRoom(); },
		}],
	}], ev.currentTarget ?? ev.target);
}

async function startUser() {
	// TODO: localOnly は連合に対応したら消す
	os.selectUser({ localOnly: true }).then(user => {
		router.push('/chat/user/:userId', {
			params: {
				userId: user.id,
			},
		});
	});
}

async function createRoom() {
	const { canceled, result } = await os.inputText({
		title: '群聊名称',
		minLength: 1,
	});
	if (canceled) return;

	const room = await misskeyApi('chat/rooms/create', {
		name: result,
	});

	router.push('/chat/room/:roomId', {
		params: {
			roomId: room.id,
		},
	});
}

async function search() {
	const res = await misskeyApi('chat/messages/search', {
		query: searchQuery.value,
	});

	searchResults.value = res;
	searched.value = true;
}

onMounted(() => {
	updateCurrentAccountPartial({ hasUnreadChatMessages: false });
});
</script>

<style lang="scss" module>
.start {
	margin: 0 auto;
}

.filters {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.filterChip {
	padding: 8px 14px;
	border-radius: 999px;
	font-size: 0.9rem;
	background: color-mix(in srgb, var(--MI_THEME-bg) 82%, var(--MI_THEME-panel) 18%);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-divider) 78%, transparent);
	transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.filterChipActive {
	color: var(--MI_THEME-accent);
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.12);
	border-color: color(from var(--MI_THEME-accent) srgb r g b / 0.32);
}

.searchResultItem {
	padding: 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 12px;
}
</style>
