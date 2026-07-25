/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const EMOJI_PICKER_SEARCH_RESULT_LIMIT = 100;
export const EMOJI_PICKER_VIRTUAL_OVERSCAN_ROWS = 2;

export type EmojiPickerSearchEntry = {
	key: string;
	name: string;
	aliases: readonly string[];
	keywords: readonly string[];
};

export type EmojiPickerCategoryTreeNode = {
	label: string;
	path: string;
	isCategory: boolean;
	category: string | null;
	children: EmojiPickerCategoryTreeNode[];
};

export type EmojiPickerVirtualRange = {
	startIndex: number;
	endIndex: number;
	startRow: number;
	endRow: number;
	totalRows: number;
	offsetTop: number;
	totalHeight: number;
};

type CategorizedEmoji = {
	category?: string | null;
};

type PreparedEmojiPickerSearchEntry = {
	entry: EmojiPickerSearchEntry;
	name: string;
	aliases: string[];
	keywords: string[];
};

const preparedSearchEntriesCache = new WeakMap<readonly EmojiPickerSearchEntry[], PreparedEmojiPickerSearchEntry[]>();

function normalize(value: string): string {
	return value.replaceAll(':', '').trim().toLocaleLowerCase();
}

function prepareSearchEntries(entries: readonly EmojiPickerSearchEntry[]): PreparedEmojiPickerSearchEntry[] {
	const cached = preparedSearchEntriesCache.get(entries);
	if (cached) return cached;

	const prepared = entries.map(entry => ({
		entry,
		name: normalize(entry.name),
		aliases: entry.aliases.map(normalize),
		keywords: entry.keywords.map(normalize),
	}));
	preparedSearchEntriesCache.set(entries, prepared);
	return prepared;
}

export function buildCustomEmojiCategoryIndex<T extends CategorizedEmoji>(emojis: readonly T[]): Map<string, T[]> {
	const categories = new Map<string, T[]>();

	for (const emoji of emojis) {
		const category = emoji.category && emoji.category !== 'null' ? emoji.category : '';
		const categoryEmojis = categories.get(category);
		if (categoryEmojis) {
			categoryEmojis.push(emoji);
		} else {
			categories.set(category, [emoji]);
		}
	}

	return categories;
}

export function buildEmojiPickerCategoryTree(categories: readonly string[]): EmojiPickerCategoryTreeNode[] {
	const root: EmojiPickerCategoryTreeNode[] = [];

	for (const category of categories) {
		if (category === '') continue;

		const parts = category.split('/').map(part => part.trim()).filter(Boolean);
		let children = root;
		let path = '';

		for (const part of parts) {
			path = path === '' ? part : `${path}/${part}`;
			let node = children.find(child => child.label === part);
			if (node == null) {
				node = {
					label: part,
					path,
					isCategory: false,
					category: null,
					children: [],
				};
				children.push(node);
			}
			if (path === parts.join('/')) {
				node.isCategory = true;
				node.category = category;
			}
			children = node.children;
		}
	}

	return root;
}

export function searchEmojiPickerEntries(
	entries: readonly EmojiPickerSearchEntry[],
	query: string,
	limit = EMOJI_PICKER_SEARCH_RESULT_LIMIT,
): EmojiPickerSearchEntry[] {
	const normalizedQuery = normalize(query);
	if (normalizedQuery === '' || limit <= 0) return [];

	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	const ranked: { entry: EmojiPickerSearchEntry; score: number; index: number }[] = [];

	const preparedEntries = prepareSearchEntries(entries);
	for (let index = 0; index < preparedEntries.length; index++) {
		const { entry, name, aliases, keywords } = preparedEntries[index];
		const searchable = [name, ...aliases, ...keywords];

		let score: number | null = null;
		if (name === normalizedQuery) {
			score = 0;
		} else if (aliases.includes(normalizedQuery) || keywords.includes(normalizedQuery)) {
			score = 1;
		} else if (name.startsWith(normalizedQuery)) {
			score = 2;
		} else if (aliases.some(alias => alias.startsWith(normalizedQuery)) || keywords.some(keyword => keyword.startsWith(normalizedQuery))) {
			score = 3;
		} else if (tokens.every(token => searchable.some(value => value.includes(token)))) {
			score = 4;
		}

		if (score != null) ranked.push({ entry, score, index });
	}

	return ranked
		.sort((a, b) => a.score - b.score || a.entry.name.length - b.entry.name.length || a.index - b.index)
		.slice(0, limit)
		.map(result => result.entry);
}

export function getEmojiPickerVirtualRange(options: {
	itemCount: number;
	columns: number;
	rowHeight: number;
	viewportHeight: number;
	scrollTop: number;
	overscanRows?: number;
}): EmojiPickerVirtualRange {
	const itemCount = Math.max(0, options.itemCount);
	const columns = Math.max(1, Math.floor(options.columns));
	const rowHeight = Math.max(1, options.rowHeight);
	const viewportHeight = Math.max(0, options.viewportHeight);
	const scrollTop = Math.max(0, options.scrollTop);
	const overscanRows = Math.max(0, Math.floor(options.overscanRows ?? EMOJI_PICKER_VIRTUAL_OVERSCAN_ROWS));
	const totalRows = Math.ceil(itemCount / columns);

	if (totalRows === 0) {
		return {
			startIndex: 0,
			endIndex: 0,
			startRow: 0,
			endRow: 0,
			totalRows: 0,
			offsetTop: 0,
			totalHeight: 0,
		};
	}

	const firstVisibleRow = Math.min(totalRows - 1, Math.floor(scrollTop / rowHeight));
	const visibleRowCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
	const startRow = Math.max(0, firstVisibleRow - overscanRows);
	const endRow = Math.min(totalRows, firstVisibleRow + visibleRowCount + overscanRows);

	return {
		startIndex: startRow * columns,
		endIndex: Math.min(itemCount, endRow * columns),
		startRow,
		endRow,
		totalRows,
		offsetTop: startRow * rowHeight,
		totalHeight: totalRows * rowHeight,
	};
}
