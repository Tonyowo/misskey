/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';

const QUICK_SELECT_CHANNEL_LIMIT = 100;

export function mergeSelectableChannels(channelSets: readonly Misskey.entities.Channel[][]): Misskey.entities.Channel[] {
	const channels = new Map<string, Misskey.entities.Channel>();

	for (const channelSet of channelSets) {
		for (const channel of channelSet) {
			if (channels.has(channel.id)) continue;
			channels.set(channel.id, channel);
		}
	}

	return [...channels.values()];
}

export async function fetchSelectableChannels(): Promise<Misskey.entities.Channel[]> {
	const [favoritedChannels, followedChannels, ownedChannels] = await Promise.all([
		misskeyApi('channels/my-favorites', { limit: QUICK_SELECT_CHANNEL_LIMIT }),
		misskeyApi('channels/followed', { limit: QUICK_SELECT_CHANNEL_LIMIT }),
		misskeyApi('channels/owned', { limit: QUICK_SELECT_CHANNEL_LIMIT }),
	]);

	return mergeSelectableChannels([favoritedChannels, followedChannels, ownedChannels]);
}
