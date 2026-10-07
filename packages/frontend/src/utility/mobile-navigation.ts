/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getSeparatedInboxItems } from '@/utility/inbox-navigation.js';

export function getMobileNavigationItems(items: readonly string[]): string[] {
	if (!items.includes('messages')) return [...items];

	const menu = getSeparatedInboxItems(items).filter(item => item !== 'publish');
	const extraItems = ['announcements', 'channels', 'clips', 'lists', 'antennas', 'pages', 'play', 'gallery', 'achievements', 'games', 'ui']
		.filter(item => !menu.includes(item));
	if (extraItems.length === 0) return menu;
	return [...menu, ...(menu.at(-1) === '-' ? [] : ['-']), ...extraItems];
}
