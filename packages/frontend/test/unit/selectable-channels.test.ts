/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { describe, expect, it } from 'vitest';
import { mergeSelectableChannels } from '@/utility/selectable-channels.js';

function createChannel(id: string, name = id): Misskey.entities.Channel {
	return {
		id,
		createdAt: new Date().toISOString(),
		lastNotedAt: null,
		name,
		description: null,
		userId: null,
		bannerUrl: null,
		bannerId: null,
		pinnedNoteIds: [],
		color: '#86b300',
		isArchived: false,
		usersCount: 0,
		notesCount: 0,
		isSensitive: false,
		allowRenoteToExternal: true,
		isFollowing: false,
		isFavorited: false,
		isMuting: false,
	};
}

describe('mergeSelectableChannels', () => {
	it('deduplicates channels while preserving first-seen order', () => {
		const favorites = [createChannel('favorite-a'), createChannel('shared', 'shared-from-favorite')];
		const followed = [createChannel('shared', 'shared-from-followed'), createChannel('followed-b')];
		const owned = [createChannel('owned-c'), createChannel('favorite-a', 'favorite-from-owned')];

		expect(mergeSelectableChannels([favorites, followed, owned])).toEqual([
			favorites[0],
			favorites[1],
			followed[1],
			owned[0],
		]);
	});
});
