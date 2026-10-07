/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Adapt existing community menus without rewriting the user's saved preferences. */
export function getSeparatedInboxItems(items: readonly string[]): string[] {
	if (!items.includes('messages')) return [...items];
	const menu: string[] = [];
	for (const item of items) {
		if (item === 'chat') continue;
		if (item === 'messages' && !items.includes('notifications')) menu.push('notifications');
		if ((item === 'messages' || item === 'notifications') && menu.includes(item)) continue;
		menu.push(item);
	}
	return menu;
}

export function getOverflowExcludedItems(items: readonly string[]): Set<string> {
	const excluded = new Set([...items, ...getSeparatedInboxItems(items)]);
	// Both keys open the same conversation destination; expose only one shortcut.
	if (excluded.has('chat')) excluded.add('messages');
	excluded.add('chat');
	return excluded;
}
