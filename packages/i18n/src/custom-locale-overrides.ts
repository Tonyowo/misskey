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
	},
	'zh-CN': {
		replyVisible: '回复后可见',
		replyVisibleLocalOnly: '含回复后可见内容的帖子会自动仅本站发布。',
		replyToSeeReplyVisible: '回复后即可查看',
		replyVisibleDialogText: '请输入仅在回复后显示的内容。支持换行、链接、表情和简单的 MFM。',
		replyVisiblePlaceholder: '回复后显示的内容',
	},
	'zh-TW': {
		replyVisible: '回覆後顯示',
		replyVisibleLocalOnly: '含有回覆後顯示內容的貼文只會發佈到本地。',
		replyToSeeReplyVisible: '回覆後即可查看',
		replyVisibleDialogText: '請輸入僅在回覆後顯示的內容。支援換行、連結、表情符號和簡單的 MFM。',
		replyVisiblePlaceholder: '回覆後顯示的內容',
	},
} as const satisfies Partial<Record<Language, ILocale>>;
