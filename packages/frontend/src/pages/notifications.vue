<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div v-if="isNotificationTab">
			<MkStreamingNotificationsTimeline :key="tab" :class="$style.notifications" :excludeTypes="excludeTypes"/>
		</div>
		<div v-else-if="tab === 'directNotes'">
			<MkNotesTimeline :paginator="directNotesPaginator"/>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref } from 'vue';
import { notificationTypes } from 'misskey-js';
import type { PageHeaderItem } from '@/types/page-header.js';
import MkStreamingNotificationsTimeline from '@/components/MkStreamingNotificationsTimeline.vue';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{ initialTab?: string }>();
const tab = ref(['all', 'comments', 'mentions', 'likes', 'reposts', 'system', 'directNotes'].includes(props.initialTab ?? '') ? props.initialTab! : 'all');
const isNotificationTab = computed(() => tab.value !== 'directNotes');
const includeTypes = ref<string[] | null>(null);
const categories = {
	comments: ['reply'], mentions: ['mention'], likes: ['reaction'], reposts: ['renote', 'quote'],
} as const;
const excludeTypes = computed(() => {
	if (tab.value === 'all') return includeTypes.value ? notificationTypes.filter(t => !includeTypes.value!.includes(t)) : null;
	if (tab.value === 'system') return notificationTypes.filter(type => Object.values(categories).some(types => (types as readonly string[]).includes(type)));
	const included = categories[tab.value as keyof typeof categories] as readonly string[] | undefined;
	return included ? notificationTypes.filter(type => !included.includes(type)) : null;
});

const directNotesPaginator = markRaw(new Paginator('notes/mentions', {
	limit: 10,
	params: {
		visibility: 'specified',
	},
}));

function setFilter(ev: PointerEvent) {
	const typeItems = notificationTypes.map(t => ({
		text: i18n.ts._notification._types[t],
		active: (includeTypes.value && includeTypes.value.includes(t)) ?? false,
		action: () => {
			includeTypes.value = [t];
		},
	}));
	const items = includeTypes.value != null ? [{
		icon: 'ti ti-x',
		text: i18n.ts.clear,
		action: () => {
			includeTypes.value = null;
		},
	}, { type: 'divider' as const }, ...typeItems] : typeItems;
	os.popupMenu(items, ev.currentTarget ?? ev.target);
}

const headerActions = computed<PageHeaderItem[]>(() => ([tab.value === 'all' ? {
	text: i18n.ts.filter,
	icon: 'ti ti-filter',
	highlighted: includeTypes.value != null,
	handler: setFilter,
} : undefined, isNotificationTab.value ? {
	text: i18n.ts.markAllAsRead,
	icon: 'ti ti-check',
	handler: () => {
		os.apiWithDialog('notifications/mark-all-as-read', {});
	},
} : undefined] as (PageHeaderItem | undefined)[]).filter(x => x !== undefined));

const headerTabs = computed(() => [{
	key: 'all',
	title: i18n.ts.all,
	icon: 'ti ti-point',
}, {
	key: 'comments',
	title: i18n.ts._community.comments,
	icon: 'ti ti-message-circle',
}, {
	key: 'mentions',
	title: i18n.ts.mentions,
	icon: 'ti ti-at',
}, {
	key: 'likes',
	title: i18n.ts._community.likes,
	icon: 'ti ti-heart',
}, {
	key: 'reposts',
	title: i18n.ts._community.reposts,
	icon: 'ti ti-repeat',
}, {
	key: 'system',
	title: i18n.ts._community.system,
	icon: 'ti ti-bell',
}, ...(tab.value === 'directNotes' ? [{
	// Keep old bookmarked notification URLs readable; new private-note navigation lives in messages.
	key: 'directNotes',
	title: i18n.ts.directNotes,
	icon: 'ti ti-mail',
}] : [])]);

definePage(() => ({
	title: i18n.ts.notifications,
	icon: 'ti ti-bell',
}));
</script>

<style module lang="scss">
.notifications {
	border-radius: var(--MI-radius);
	overflow: clip;
}
</style>
