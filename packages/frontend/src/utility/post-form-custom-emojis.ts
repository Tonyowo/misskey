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
const ASCII_ALPHANUMERIC_REGEX = /^[a-zA-Z0-9]$/;

function isFollowedByAsciiAlphanumeric(text: string, index: number): boolean {
	return ASCII_ALPHANUMERIC_REGEX.test(text[index] ?? '');
}

function pushTextSegment(segments: PostFormCustomEmojiSegment[], value: string): void {
	if (value === '') return;

	const last = segments.at(-1);
	if (last?.type === 'text') {
		last.value += value;
	} else {
		segments.push({
			type: 'text',
			value,
		});
	}
}

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
			pushTextSegment(segments, text.slice(lastIndex, index));
		}

		if (hasCustomEmoji(name) && !isFollowedByAsciiAlphanumeric(text, index + matchText.length)) {
			segments.push({
				type: 'customEmoji',
				name,
				value: matchText,
			});
		} else {
			pushTextSegment(segments, matchText);
		}

		lastIndex = index + matchText.length;
	}

	if (lastIndex < text.length) {
		pushTextSegment(segments, text.slice(lastIndex));
	}

	if (segments.length === 0) {
		segments.push({
			type: 'text',
			value: text,
		});
	}

	return segments;
}
