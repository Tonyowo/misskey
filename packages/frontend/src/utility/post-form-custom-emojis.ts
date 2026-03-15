/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type PostFormCustomEmojiSegment = {
	type: 'text';
	value: string;
} | {
	type: 'customEmoji';
	name: string;
	value: string;
};

const CUSTOM_EMOJI_CODE_REGEX = /:([a-zA-Z0-9_+\-]+):/g;

export function tokenizePostFormCustomEmojis(
	text: string,
	hasCustomEmoji: (name: string) => boolean,
): PostFormCustomEmojiSegment[] {
	const segments: PostFormCustomEmojiSegment[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(CUSTOM_EMOJI_CODE_REGEX)) {
		const matchText = match[0];
		const name = match[1];
		const index = match.index ?? 0;

		if (index > lastIndex) {
			segments.push({
				type: 'text',
				value: text.slice(lastIndex, index),
			});
		}

		if (hasCustomEmoji(name)) {
			segments.push({
				type: 'customEmoji',
				name,
				value: matchText,
			});
		} else {
			segments.push({
				type: 'text',
				value: matchText,
			});
		}

		lastIndex = index + matchText.length;
	}

	if (lastIndex < text.length) {
		segments.push({
			type: 'text',
			value: text.slice(lastIndex),
		});
	}

	if (segments.length === 0) {
		segments.push({
			type: 'text',
			value: text,
		});
	}

	return segments;
}
