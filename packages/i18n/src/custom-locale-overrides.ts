/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { languages } from './const.js';
import type { ILocale } from './types.js';

type Language = typeof languages[number];

/**
 * Translations for custom features that are not managed by the upstream Crowdin project.
 *
 * Keep these overrides separate from /locales so that Crowdin synchronization cannot
 * overwrite them.
 */
export const customLocaleOverrides = {
	'en-US': {
		replyVisible: 'Show after reply',
		replyVisibleLocalOnly: 'Posts containing reply-only content are published locally only.',
		replyToSeeReplyVisible: 'Reply to see this content',
		replyVisibleDialogText: 'Enter content that will be shown only after a reply. Line breaks, links, emoji, and simple MFM are supported.',
		replyVisiblePlaceholder: 'Content shown after a reply',
		_emojiPicker: {
			searchPlaceholder: 'Search emoji',
			searchResultCount: '{count} results',
			noSearchResults: 'No matching emoji',
			frequentlyUsed: 'Frequently used',
			noFrequentlyUsedEmojis: 'Emoji you use will appear here',
			categoryNavigation: 'Emoji categories',
			openCategoryMenu: 'Open category list',
			previousCategories: 'Previous categories',
			thisCategory: 'This category',
			categories: {
				face: 'Smileys & Emotion',
				people: 'People & Body',
				animalsAndNature: 'Animals & Nature',
				foodAndDrink: 'Food & Drink',
				activity: 'Activities',
				travelAndPlaces: 'Travel & Places',
				objects: 'Objects',
				symbols: 'Symbols',
				flags: 'Flags',
			},
		},
	},
	'zh-CN': {
		replyVisible: '回复后可见',
		replyVisibleLocalOnly: '含回复后可见内容的帖子会自动仅本站发布。',
		replyToSeeReplyVisible: '回复后即可查看',
		replyVisibleDialogText: '请输入仅在回复后显示的内容。支持换行、链接、表情和简单的 MFM。',
		replyVisiblePlaceholder: '回复后显示的内容',
		_emojiPicker: {
			searchPlaceholder: '搜索表情符号',
			searchResultCount: '{count} 个结果',
			noSearchResults: '没有匹配的表情符号',
			frequentlyUsed: '常用表情符号',
			noFrequentlyUsedEmojis: '使用过的表情符号会显示在这里',
			categoryNavigation: '表情符号分类',
			openCategoryMenu: '打开分类列表',
			previousCategories: '上一个分类',
			thisCategory: '当前分类',
			categories: {
				face: '表情与情感',
				people: '人物与身体',
				animalsAndNature: '动物与自然',
				foodAndDrink: '食物与饮品',
				activity: '活动',
				travelAndPlaces: '旅行与地点',
				objects: '物品',
				symbols: '符号',
				flags: '旗帜',
			},
		},
	},
	'zh-TW': {
		replyVisible: '回覆後顯示',
		replyVisibleLocalOnly: '含有回覆後顯示內容的貼文只會發佈到本地。',
		replyToSeeReplyVisible: '回覆後即可查看',
		replyVisibleDialogText: '請輸入僅在回覆後顯示的內容。支援換行、連結、表情符號和簡單的 MFM。',
		replyVisiblePlaceholder: '回覆後顯示的內容',
		_emojiPicker: {
			searchPlaceholder: '搜尋表情符號',
			searchResultCount: '{count} 個結果',
			noSearchResults: '找不到相符的表情符號',
			frequentlyUsed: '常用表情符號',
			noFrequentlyUsedEmojis: '使用過的表情符號會顯示在這裡',
			categoryNavigation: '表情符號分類',
			openCategoryMenu: '開啟分類列表',
			previousCategories: '上一個分類',
			thisCategory: '目前分類',
			categories: {
				face: '表情與情感',
				people: '人物與身體',
				animalsAndNature: '動物與自然',
				foodAndDrink: '食物與飲料',
				activity: '活動',
				travelAndPlaces: '旅遊與地點',
				objects: '物品',
				symbols: '符號',
				flags: '旗幟',
			},
		},
	},
} as const satisfies Partial<Record<Language, ILocale>>;
