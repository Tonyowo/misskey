/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { shouldShowChatHistorySenderSubline } from '@/utility/chat-system-event-text.js';

describe('shouldShowChatHistorySenderSubline', () => {
	test('returns false for group system events to avoid duplicate actor labels', () => {
		expect(shouldShowChatHistorySenderSubline({
			type: 'system',
			toRoomId: 'room-a',
			fromUser: {
				username: 'hkevin_hzh',
				name: 'hkevin_hzh',
			},
			systemEvent: {
				type: 'member_joined',
			},
		})).toBe(false);
	});

	test('returns true for regular group messages from a user', () => {
		expect(shouldShowChatHistorySenderSubline({
			type: 'text',
			toRoomId: 'room-a',
			fromUser: {
				username: 'alice',
				name: 'Alice',
			},
			text: 'hello',
		})).toBe(true);
	});

	test('returns false for direct messages', () => {
		expect(shouldShowChatHistorySenderSubline({
			type: 'text',
			toRoomId: null,
			fromUser: {
				username: 'alice',
			},
			text: 'hello',
		})).toBe(false);
	});
});
