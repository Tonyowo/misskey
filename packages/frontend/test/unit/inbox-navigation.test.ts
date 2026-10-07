/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { getOverflowExcludedItems, getSeparatedInboxItems } from '@/utility/inbox-navigation.js';

describe('separate notification and conversation navigation', () => {
	test('adapts the previously saved combined inbox menu without mutating it', () => {
		const stored = Object.freeze(['explore', 'messages', '-', 'chat', 'drive']);
		expect(getSeparatedInboxItems(stored)).toEqual(['explore', 'notifications', 'messages', '-', 'drive']);
		expect(stored).toContain('chat');
		expect(stored).not.toContain('notifications');
	});
	test('keeps an explicitly positioned notification shortcut and removes duplicate aliases', () => {
		expect(getSeparatedInboxItems(['messages', 'chat', '-', 'notifications', 'notifications', 'messages'])).toEqual(['messages', '-', 'notifications']);
	});
	test('preserves a legacy custom menu which already has separate shortcuts', () => {
		const stored = ['notifications', 'chat', 'drive'];
		expect(getSeparatedInboxItems(stored)).toEqual(stored);
	});
	test('the overflow cannot reintroduce notifications or a second conversation shortcut', () => {
		const excluded = getOverflowExcludedItems(['messages']);
		for (const item of ['messages', 'notifications', 'chat']) expect(excluded.has(item)).toBe(true);
		expect(excluded.has('channels')).toBe(false);
	});
	test('a legacy chat shortcut excludes the message alias without hiding notifications', () => {
		const excluded = getOverflowExcludedItems(['chat']);
		expect(excluded.has('messages')).toBe(true);
		expect(excluded.has('chat')).toBe(true);
		expect(excluded.has('notifications')).toBe(false);
	});
	test('an unpinned conversation feature has only its canonical shortcut in overflow', () => {
		const excluded = getOverflowExcludedItems(['announcements']);
		expect(excluded.has('messages')).toBe(false);
		expect(excluded.has('chat')).toBe(true);
	});
});
