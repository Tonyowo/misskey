/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ChatConversationFilter } from './history-items.js';

export const chatHomeTabs = ['conversation', 'groups'] as const;
export type ChatHomeTab = typeof chatHomeTabs[number];

export const chatHomeFocusTargets = ['invitations', 'requests', 'approvals'] as const;
export type ChatHomeFocusTarget = typeof chatHomeFocusTargets[number];

function includes<const T extends readonly string[]>(values: T, value: string): value is T[number] {
	return values.includes(value as T[number]);
}

export function parseChatHomeTab(value: string | null | undefined): ChatHomeTab {
	return value != null && includes(chatHomeTabs, value) ? value : 'conversation';
}

export function parseChatHomeFilter(value: string | null | undefined): ChatConversationFilter {
	switch (value) {
		case 'unread':
		case 'direct':
		case 'group':
			return value;
		case 'all':
		default:
			return 'all';
	}
}

export function parseChatHomeFocus(value: string | null | undefined): ChatHomeFocusTarget | null {
	return value != null && includes(chatHomeFocusTargets, value) ? value : null;
}

export function buildChatHomeQuery(state: {
	tab: ChatHomeTab;
	filter: ChatConversationFilter;
	q: string;
	focus: ChatHomeFocusTarget | null;
}): Partial<{
	tab: ChatHomeTab;
	filter: ChatConversationFilter;
	q: string;
	focus: ChatHomeFocusTarget;
}> {
	const query: Partial<{
		tab: ChatHomeTab;
		filter: ChatConversationFilter;
		q: string;
		focus: ChatHomeFocusTarget;
	}> = {};

	if (state.tab !== 'conversation') {
		query.tab = state.tab;
	}

	if (state.filter !== 'all') {
		query.filter = state.filter;
	}

	const trimmedQuery = state.q.trim();
	if (trimmedQuery.length > 0) {
		query.q = trimmedQuery;
	}

	if (state.tab === 'groups' && state.focus != null) {
		query.focus = state.focus;
	}

	return query;
}
