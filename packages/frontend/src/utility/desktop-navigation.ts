/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getSeparatedInboxItems } from '@/utility/inbox-navigation.js';

export function getDesktopNavigationItems(items: readonly string[]): string[] {
	// Community navigation separates notifications and conversations, with a dedicated composer and account menu.
	// Keep the stored menu intact so mobile navigation and legacy custom menus are preserved.
	if (!items.includes('messages')) return [...items];

	const menu: string[] = [];
	for (const item of getSeparatedInboxItems(items)) {
		if (item === 'publish' || item === 'profile' || item === 'chat') continue;
		if (item === '-' && (menu.length === 0 || menu.at(-1) === '-')) continue;
		menu.push(item);
	}
	if (menu.at(-1) === '-') menu.pop();
	return menu;
}
