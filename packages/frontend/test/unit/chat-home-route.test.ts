/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	buildChatHomeQuery,
	parseChatHomeFilter,
	parseChatHomeFocus,
	parseChatHomeTab,
} from '@/pages/chat/home.route.js';

describe('chat home route helpers', () => {
	test('parses only known tab values', () => {
		expect(parseChatHomeTab('groups')).toBe('groups');
		expect(parseChatHomeTab('invalid')).toBe('conversation');
		expect(parseChatHomeTab(undefined)).toBe('conversation');
	});

	test('parses only known filter values', () => {
		expect(parseChatHomeFilter('unread')).toBe('unread');
		expect(parseChatHomeFilter('direct')).toBe('direct');
		expect(parseChatHomeFilter('wat')).toBe('all');
	});

	test('parses only known focus values', () => {
		expect(parseChatHomeFocus('approvals')).toBe('approvals');
		expect(parseChatHomeFocus('unknown')).toBeNull();
	});

	test('omits default query params when building a chat home url', () => {
		expect(buildChatHomeQuery({
			tab: 'conversation',
			filter: 'all',
			q: '',
			focus: null,
		})).toEqual({});
	});

	test('keeps non-default query params when building a chat home url', () => {
		expect(buildChatHomeQuery({
			tab: 'groups',
			filter: 'unread',
			q: '  wow cool  ',
			focus: 'approvals',
		})).toEqual({
			tab: 'groups',
			filter: 'unread',
			q: 'wow cool',
			focus: 'approvals',
		});
	});

	test('drops focus when the current tab is not groups', () => {
		expect(buildChatHomeQuery({
			tab: 'conversation',
			filter: 'all',
			q: '',
			focus: 'requests',
		})).toEqual({});
	});
});
