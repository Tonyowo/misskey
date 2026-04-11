/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { canWriteInDirectChat } from '@/pages/chat/direct-chat-availability.js';

const baseUser = {
	canChat: true,
	chatScope: 'everyone',
	host: null,
	isFollowed: false,
	isFollowing: false,
} as const;

describe('direct chat availability', () => {
	test('allows direct chat when the target accepts chats from everyone', () => {
		expect(canWriteInDirectChat({
			myChatAvailability: 'available',
			user: baseUser,
			hasApprovalFromOtherUser: false,
		})).toBe(true);
	});

	test('blocks the form when my chat permission is readonly', () => {
		expect(canWriteInDirectChat({
			myChatAvailability: 'readonly',
			user: baseUser,
			hasApprovalFromOtherUser: false,
		})).toBe(false);
	});

	test('blocks the form for remote or chat-disabled accounts', () => {
		expect(canWriteInDirectChat({
			myChatAvailability: 'available',
			user: {
				...baseUser,
				host: 'remote.example',
			},
			hasApprovalFromOtherUser: false,
		})).toBe(false);

		expect(canWriteInDirectChat({
			myChatAvailability: 'available',
			user: {
				...baseUser,
				canChat: false,
			},
			hasApprovalFromOtherUser: false,
		})).toBe(false);
	});

	test('matches follow-based chat scopes before the other side has approved me', () => {
		expect(canWriteInDirectChat({
			myChatAvailability: 'available',
			user: {
				...baseUser,
				chatScope: 'followers',
				isFollowing: true,
			},
			hasApprovalFromOtherUser: false,
		})).toBe(true);

		expect(canWriteInDirectChat({
			myChatAvailability: 'available',
			user: {
				...baseUser,
				chatScope: 'following',
				isFollowed: true,
			},
			hasApprovalFromOtherUser: false,
		})).toBe(true);

		expect(canWriteInDirectChat({
			myChatAvailability: 'available',
			user: {
				...baseUser,
				chatScope: 'mutual',
				isFollowing: true,
				isFollowed: false,
			},
			hasApprovalFromOtherUser: false,
		})).toBe(false);
	});

	test('allows replying after the other user has already approved me', () => {
		expect(canWriteInDirectChat({
			myChatAvailability: 'available',
			user: {
				...baseUser,
				chatScope: 'none',
			},
			hasApprovalFromOtherUser: true,
		})).toBe(true);
	});
});
