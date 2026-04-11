/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

type DirectChatAvailabilityUser = Pick<Misskey.entities.UserDetailed, 'canChat' | 'chatScope' | 'host' | 'isFollowed' | 'isFollowing'>;

export function canWriteInDirectChat(params: {
	myChatAvailability: 'available' | 'readonly' | 'unavailable';
	user: DirectChatAvailabilityUser;
	hasApprovalFromOtherUser: boolean;
}): boolean {
	const { myChatAvailability, user, hasApprovalFromOtherUser } = params;

	if (myChatAvailability !== 'available') return false;
	if (!user.canChat || user.host != null) return false;
	if (hasApprovalFromOtherUser) return true;

	switch (user.chatScope) {
		case 'everyone':
			return true;
		case 'followers':
			return user.isFollowing === true;
		case 'following':
			return user.isFollowed === true;
		case 'mutual':
			return user.isFollowing === true && user.isFollowed === true;
		case 'none':
		default:
			return false;
	}
}
