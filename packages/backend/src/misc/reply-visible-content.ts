/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';

export type ReplyVisibleContent = {
	text: string;
};

export const REPLY_VISIBLE_FUNCTION = 'replyVisible';
const LOCKED_LABEL = 'reply visible';
const EMPTY_REPLY_VISIBLE_PATTERN = /\s*\$\[replyVisible\s*\]\s*/g;

function makeReplyVisibleNode(index: number, children: mfm.MfmNode[]): mfm.MfmNode {
	return {
		type: 'fn',
		props: {
			name: REPLY_VISIBLE_FUNCTION,
			args: {
				index: index.toString(),
			},
		},
		children,
	} as mfm.MfmNode;
}

function makeHiddenPlaceholder(index: number): mfm.MfmNode {
	return makeReplyVisibleNode(index, [{
		type: 'text',
		props: {
			text: LOCKED_LABEL,
		},
	} as mfm.MfmNode]);
}

function makeRevealedNode(text: string): mfm.MfmNode[] {
	const children = mfm.parse(text);
	return [{
		type: 'fn',
		props: {
			name: REPLY_VISIBLE_FUNCTION,
			args: {
				revealed: 'true',
			},
		},
		children,
	} as mfm.MfmNode];
}

function getReplyVisibleIndex(node: mfm.MfmNode): number | null {
	if (node.type !== 'fn') return null;
	if (node.props.name !== REPLY_VISIBLE_FUNCTION) return null;

	const rawIndex = node.props.args.index;
	if (typeof rawIndex !== 'string') return null;

	const index = Number.parseInt(rawIndex, 10);
	return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

export function extractReplyVisibleContents(text: string | null | undefined): {
	text: string | null;
	replyVisibleContents: ReplyVisibleContent[];
} {
	if (text == null || text === '') {
		return {
			text: null,
			replyVisibleContents: [],
		};
	}

	const replyVisibleContents: ReplyVisibleContent[] = [];
	text = text.replace(EMPTY_REPLY_VISIBLE_PATTERN, ' ').trim();
	if (text === '') {
		return {
			text: null,
			replyVisibleContents,
		};
	}

	const convert = (nodes: mfm.MfmNode[]): mfm.MfmNode[] => {
		return nodes.flatMap(node => {
			if (node.type === 'fn' && node.props.name === REPLY_VISIBLE_FUNCTION) {
				const hiddenText = mfm.toString(node.children ?? []).trim();
				if (hiddenText === '') return [];

				const index = replyVisibleContents.push({ text: hiddenText }) - 1;
				return [makeHiddenPlaceholder(index)];
			}

			if ('children' in node && Array.isArray(node.children)) {
				return [{
					...node,
					children: convert(node.children),
				} as mfm.MfmNode];
			}

			return [node];
		});
	};

	const publicText = mfm.toString(convert(mfm.parse(text))).trim();

	return {
		text: publicText === '' ? null : publicText,
		replyVisibleContents,
	};
}

export function renderReplyVisibleContents(
	text: string | null | undefined,
	replyVisibleContents: ReplyVisibleContent[] | null | undefined,
	canReveal: boolean,
): string | null {
	if (text == null || text === '') return text ?? null;
	if (!canReveal || replyVisibleContents == null || replyVisibleContents.length === 0) return text;

	const convert = (nodes: mfm.MfmNode[]): mfm.MfmNode[] => {
		return nodes.flatMap(node => {
			const index = getReplyVisibleIndex(node);
			if (index != null) {
				const content = replyVisibleContents[index];
				if (content == null) return [node];
				return makeRevealedNode(content.text);
			}

			if ('children' in node && Array.isArray(node.children)) {
				return [{
					...node,
					children: convert(node.children),
				} as mfm.MfmNode];
			}

			return [node];
		});
	};

	return mfm.toString(convert(mfm.parse(text)));
}
