<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :tabs="tabs" :actions="actions">
	<div class="_spacer _gaps" style="--MI_SPACER-w: 800px;">
		<template v-if="tab === 'conversations'">
			<nav class="_buttons" :aria-label="i18n.ts._community.groups">
				<MkA class="_link" to="/chat">{{ i18n.ts._community.groups }}</MkA>
				<MkA class="_link" to="/chat?tab=groups&amp;focus=invitations">{{ i18n.ts._community.invitations }}</MkA>
				<MkA class="_link" to="/chat?tab=groups&amp;focus=requests">{{ i18n.ts._community.requests }}</MkA>
				<MkA class="_link" to="/chat?tab=groups&amp;focus=approvals">{{ i18n.ts._community.approvals }}</MkA>
			</nav>
			<MkChatHistories/>
			<MkA class="_link" to="/my/notifications?tab=directNotes">{{ i18n.ts.directNotes }}</MkA>
		</template>
		<MkStreamingNotificationsTimeline v-else :key="tab" :excludeTypes="excludeTypes"/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { notificationTypes } from 'misskey-js';
import MkChatHistories from '@/components/MkChatHistories.vue';
import MkStreamingNotificationsTimeline from '@/components/MkStreamingNotificationsTimeline.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import { emitChatHomeInvalidated } from '@/pages/chat/state.js';

const tab = ref('conversations');
const categories = {
	comments: ['reply'], mentions: ['mention'], likes: ['reaction'], reposts: ['renote', 'quote'],
} as const;
const excludeTypes = computed(() => {
	if (tab.value === 'system') return notificationTypes.filter(type => Object.values(categories).some(types => (types as readonly string[]).includes(type)));
	const included = categories[tab.value as keyof typeof categories] as readonly string[] | undefined;
	return included ? notificationTypes.filter(type => !included.includes(type)) : null;
});
const tabs = computed(() => [
	{ key: 'conversations', title: i18n.ts._community.conversations, icon: 'ti ti-messages' },
	{ key: 'comments', title: i18n.ts._community.comments, icon: 'ti ti-message-circle' },
	{ key: 'mentions', title: i18n.ts.mentions, icon: 'ti ti-at' },
	{ key: 'likes', title: i18n.ts._community.likes, icon: 'ti ti-heart' },
	{ key: 'reposts', title: i18n.ts._community.reposts, icon: 'ti ti-repeat' },
	{ key: 'system', title: i18n.ts._community.system, icon: 'ti ti-bell' },
]);
const actions = computed(() => [{
	text: i18n.ts.markAllAsRead, icon: 'ti ti-check',
	handler: async () => {
		if (tab.value === 'conversations') {
			await os.apiWithDialog('chat/read-all', {});
			updateCurrentAccountPartial({ hasUnreadChatMessages: false });
			emitChatHomeInvalidated({ reason: 'chat-read-all-from-home' });
		} else { await os.apiWithDialog('notifications/mark-all-as-read', {}); }
	},
}]);
definePage(() => ({ title: i18n.ts._community.messages, icon: 'ti ti-messages' }));
</script>
