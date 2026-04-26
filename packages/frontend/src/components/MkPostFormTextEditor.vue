<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	ref="editorEl"
	v-bind="attrs"
	:class="$style.editor"
	:contenteditable="!disabled && !readonly"
	:data-disabled="disabled"
	:data-empty="renderedText === '' && !composing"
	:data-placeholder="placeholder"
	role="textbox"
	aria-multiline="true"
	spellcheck="true"
	@focus="onFocus"
	@blur="onBlur"
	@beforeinput="onBeforeInput"
	@input="onInput"
	@pointerdown="onPointerDown"
	@keydown="onKeydown"
	@keyup="onKeyup"
	@mouseup="rememberSelection"
	@touchend="rememberSelection"
	@paste="onPaste"
	@copy="onCopy"
	@cut="onCut"
	@compositionstart="onCompositionStart"
	@compositionupdate="onCompositionUpdate"
	@compositionend="onCompositionEnd"
></div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, ref, useAttrs, useCssModule, useTemplateRef, watch } from 'vue';
import { parse as parseTwemoji } from '@twemoji/parser';
import { char2fluentEmojiFilePath, char2twemojiFilePath } from '@@/js/emoji-base.js';
import type { AutocompleteTarget } from '@/utility/autocomplete.js';
import { customEmojis, customEmojisMap } from '@/custom-emojis.js';
import { getProxiedImageUrl, getStaticImageUrl } from '@/utility/media-proxy.js';
import { prefer } from '@/preferences.js';
import { tokenizePostFormCustomEmojis } from '@/utility/post-form-custom-emojis.js';

defineOptions({
	inheritAttrs: false,
});

type SelectionRange = {
	start: number;
	end: number;
};

type ApplyTextUpdateOptions = {
	skipNextInputNormalization?: boolean;
};

const props = withDefaults(defineProps<{
	modelValue: string;
	placeholder?: string;
	readonly?: boolean;
	disabled?: boolean;
}>(), {
	placeholder: '',
	readonly: false,
	disabled: false,
});

const emit = defineEmits<{
	(ev: 'update:modelValue', value: string): void;
	(ev: 'keydown', value: KeyboardEvent): void;
	(ev: 'keyup', value: KeyboardEvent): void;
	(ev: 'paste', value: ClipboardEvent): void;
	(ev: 'compositionupdate', value: CompositionEvent): void;
	(ev: 'compositionend', value: CompositionEvent): void;
}>();

const attrs = useAttrs();
const cssModule = useCssModule();
const editorEl = useTemplateRef<HTMLDivElement>('editorEl');
const renderedText = ref(props.modelValue ?? '');
const composing = ref(false);
const focused = ref(false);
const lastSelectionRange = ref<SelectionRange>({ start: renderedText.value.length, end: renderedText.value.length });
let skipInputNormalizationUntilRender = false;
const TOKEN_CARET_ANCHOR = '\u200b';

function stripCaretAnchors(value: string) {
	return value.replaceAll(TOKEN_CARET_ANCHOR, '');
}

function getLeadingCaretAnchorLength(value: string) {
	let length = 0;
	while (value[length] === TOKEN_CARET_ANCHOR) {
		length++;
	}
	return length;
}

function getRawTextLength(value: string, endOffset = value.length) {
	let length = 0;
	for (let i = 0; i < Math.min(endOffset, value.length); i++) {
		if (value[i] !== TOKEN_CARET_ANCHOR) {
			length++;
		}
	}
	return length;
}

function getDomOffsetForRawTextOffset(value: string, rawOffset: number) {
	if (rawOffset <= 0) {
		return getLeadingCaretAnchorLength(value);
	}

	let length = 0;
	for (let i = 0; i < value.length; i++) {
		if (value[i] === TOKEN_CARET_ANCHOR) continue;
		length++;
		if (length === rawOffset) {
			return i + 1;
		}
	}

	return value.length;
}

function getSegments() {
	return tokenizePostFormCustomEmojis(renderedText.value, (name) => customEmojisMap.has(name));
}

function getTokenBoundaries() {
	const boundaries: Array<{ start: number; end: number; type: 'customEmoji' | 'unicodeEmoji' }> = [];
	let cursor = 0;

	for (const segment of getSegments()) {
		const length = segment.value.length;
		if (segment.type === 'customEmoji') {
			boundaries.push({
				start: cursor,
				end: cursor + length,
				type: segment.type,
			});
		} else if (getEmojiStyle() !== 'native') {
			for (const emoji of parseUnicodeEmojis(segment.value)) {
				boundaries.push({
					start: cursor + emoji.start,
					end: cursor + emoji.end,
					type: 'unicodeEmoji',
				});
			}
		}
		cursor += length;
	}

	return boundaries;
}

function rangeIntersectsToken(start: number, end: number) {
	return getTokenBoundaries().some(segment => start < segment.end && end > segment.start);
}

function getTokenBefore(offset: number) {
	return getTokenBoundaries().find(segment => segment.end === offset);
}

function getTokenAfter(offset: number) {
	return getTokenBoundaries().find(segment => segment.start === offset);
}

watch(() => props.modelValue, (value) => {
	const next = value ?? '';
	if (composing.value || next === renderedText.value) return;

	const selection = focused.value ? getSelectionRange() : null;
	renderedText.value = next;

	nextTick(() => {
		renderEditorContent(selection);
	});
});

watch(customEmojis, () => {
	if (composing.value) return;
	const selection = focused.value ? getSelectionRange() : null;
	nextTick(() => {
		renderEditorContent(selection);
	});
});

watch(() => prefer.s.emojiStyle, () => {
	if (composing.value) return;
	const selection = focused.value ? getSelectionRange() : null;
	nextTick(() => {
		renderEditorContent(selection);
	});
});

onMounted(() => {
	renderEditorContent();
});

function getEmojiStyle(): 'native' | 'fluentEmoji' | 'twemoji' {
	return prefer.s.emojiStyle === 'native' || prefer.s.emojiStyle === 'twemoji' ? prefer.s.emojiStyle : 'fluentEmoji';
}

function parseUnicodeEmojis(value: string) {
	return parseTwemoji(value)
		.map(emoji => ({
			value: emoji.text,
			start: emoji.indices[0],
			end: emoji.indices[1],
		}))
		.filter(emoji => emoji.value !== '\uFE0F');
}

function getCustomEmojiImageUrl(name: string): string {
	const rawUrl = customEmojisMap.get(name)?.url ?? `/emoji/${name}.webp`;
	const proxiedUrl = rawUrl.startsWith('/emoji/')
		? rawUrl
		: getProxiedImageUrl(rawUrl, 'emoji', false, true);

	return prefer.s.disableShowingAnimatedImages
		? getStaticImageUrl(proxiedUrl)
		: proxiedUrl;
}

function getUnicodeEmojiImageUrl(emoji: string): string {
	return getEmojiStyle() === 'twemoji' ? char2twemojiFilePath(emoji) : char2fluentEmojiFilePath(emoji);
}

function createCustomEmojiNode(name: string, raw: string): HTMLSpanElement {
	const span = window.document.createElement('span');
	span.className = cssModule.customEmoji;
	span.dataset.raw = raw;
	span.contentEditable = 'false';

	const img = window.document.createElement('img');
	img.className = cssModule.customEmojiImage;
	img.src = getCustomEmojiImageUrl(name);
	img.alt = raw;
	img.title = raw;
	img.decoding = 'async';
	img.draggable = false;
	img.style.setProperty('-webkit-user-drag', 'none');
	img.style.display = 'inline-block';
	img.style.width = '1.25em';
	img.style.height = '1.25em';
	img.style.maxWidth = 'none';
	img.style.maxHeight = 'none';
	img.style.objectFit = 'contain';
	img.style.verticalAlign = '-0.25em';
	img.style.flex = 'none';

	span.append(img);
	return span;
}

function createUnicodeEmojiNode(raw: string): HTMLSpanElement {
	const span = window.document.createElement('span');
	span.className = cssModule.unicodeEmoji;
	span.dataset.raw = raw;
	span.contentEditable = 'false';

	const img = window.document.createElement('img');
	img.className = cssModule.unicodeEmojiImage;
	img.src = getUnicodeEmojiImageUrl(raw);
	img.alt = raw;
	img.decoding = 'async';
	img.draggable = false;
	img.style.setProperty('-webkit-user-drag', 'none');
	img.style.display = 'inline-block';
	img.style.width = '1.25em';
	img.style.height = '1.25em';
	img.style.maxWidth = 'none';
	img.style.maxHeight = 'none';
	img.style.objectFit = 'contain';
	img.style.verticalAlign = '-0.25em';
	img.style.flex = 'none';
	img.onerror = () => {
		const fallbackUrl = char2twemojiFilePath(raw);
		if (getEmojiStyle() === 'fluentEmoji' && img.getAttribute('src') !== fallbackUrl) {
			img.src = fallbackUrl;
		}
	};

	span.append(img);
	return span;
}

function createTokenCaretAnchorNode() {
	const span = window.document.createElement('span');
	span.className = cssModule.tokenCaretAnchor;
	span.dataset.caretAnchor = 'true';
	span.append(window.document.createTextNode(TOKEN_CARET_ANCHOR));
	return span;
}

function getTokenCaretAnchorPoint(node: HTMLElement): { node: Node; offset: number } | null {
	const nextSibling = node.nextSibling;
	if (nextSibling?.nodeType === Node.TEXT_NODE) {
		const text = nextSibling.textContent ?? '';
		if (!text.startsWith(TOKEN_CARET_ANCHOR)) return null;

		return {
			node: nextSibling,
			offset: getLeadingCaretAnchorLength(text),
		};
	}

	if (!(nextSibling instanceof HTMLElement) || nextSibling.dataset.caretAnchor !== 'true') return null;

	const anchorText = nextSibling.firstChild;
	if (anchorText?.nodeType !== Node.TEXT_NODE) return null;

	return {
		node: anchorText,
		offset: getLeadingCaretAnchorLength(anchorText.textContent ?? ''),
	};
}

function appendTextWithUnicodeEmojis(fragment: DocumentFragment, value: string) {
	if (value === '') return;

	const emojis = getEmojiStyle() === 'native' ? [] : parseUnicodeEmojis(value);
	let cursor = 0;

	for (const emoji of emojis) {
		if (emoji.start > cursor) {
			fragment.append(window.document.createTextNode(value.slice(cursor, emoji.start)));
		}

		fragment.append(createUnicodeEmojiNode(emoji.value));
		fragment.append(createTokenCaretAnchorNode());
		cursor = emoji.end;
	}

	if (cursor < value.length) {
		fragment.append(window.document.createTextNode(value.slice(cursor)));
	}
}

function renderEditorContent(selection: SelectionRange | null = focused.value ? lastSelectionRange.value : null) {
	if (editorEl.value == null || composing.value) return;

	const fragment = window.document.createDocumentFragment();
	for (const segment of getSegments()) {
		if (segment.type === 'text') {
			appendTextWithUnicodeEmojis(fragment, segment.value);
			continue;
		}

		fragment.append(createCustomEmojiNode(segment.name, segment.value));
		fragment.append(createTokenCaretAnchorNode());
	}

	const scrollLeft = editorEl.value.scrollLeft;
	const scrollTop = editorEl.value.scrollTop;
	editorEl.value.replaceChildren(fragment);
	editorEl.value.scrollLeft = scrollLeft;
	editorEl.value.scrollTop = scrollTop;

	if (selection != null && focused.value) {
		setSelectionRange(selection.start, selection.end);
	}
}

function serializeNode(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return stripCaretAnchors(node.textContent ?? '');
	}

	if (node instanceof HTMLBRElement) {
		return '\n';
	}

	if (node instanceof HTMLElement && node.dataset.raw != null) {
		return node.dataset.raw;
	}

	return Array.from(node.childNodes).map(serializeNode).join('');
}

function getCurrentText(): string {
	if (editorEl.value == null) return renderedText.value;
	return Array.from(editorEl.value.childNodes).map(serializeNode).join('');
}

function getNodeRawLength(node: Node): number {
	if (node.nodeType === Node.TEXT_NODE) {
		return getRawTextLength(node.textContent ?? '');
	}

	if (node instanceof HTMLBRElement) {
		return 1;
	}

	if (node instanceof HTMLElement && node.dataset.raw != null) {
		return node.dataset.raw.length;
	}

	return Array.from(node.childNodes).reduce((sum, child) => sum + getNodeRawLength(child), 0);
}

function getPointOffset(container: Node, offset: number): number {
	if (editorEl.value == null) return 0;

	let total = 0;

	const walk = (node: Node): number | null => {
		if (node === container) {
			if (node.nodeType === Node.TEXT_NODE) {
				return total + getRawTextLength(node.textContent ?? '', offset);
			}

			if (node instanceof HTMLElement && node.dataset.raw != null) {
				return total + (offset === 0 ? 0 : node.dataset.raw.length);
			}

			let partial = total;
			for (let i = 0; i < Math.min(offset, node.childNodes.length); i++) {
				partial += getNodeRawLength(node.childNodes[i]);
			}
			return partial;
		}

		if (node.nodeType === Node.TEXT_NODE) {
			total += getRawTextLength(node.textContent ?? '');
			return null;
		}

		if (node instanceof HTMLBRElement) {
			total += 1;
			return null;
		}

		if (node instanceof HTMLElement && node.dataset.raw != null) {
			total += node.dataset.raw.length;
			return null;
		}

		for (const child of Array.from(node.childNodes)) {
			const result = walk(child);
			if (result != null) {
				return result;
			}
		}

		return null;
	};

	return walk(editorEl.value) ?? total;
}

function getSelectionRange(): SelectionRange {
	if (skipInputNormalizationUntilRender) {
		return lastSelectionRange.value;
	}

	const selection = window.getSelection();
	if (selection == null || selection.rangeCount === 0 || editorEl.value == null) {
		return lastSelectionRange.value;
	}

	const range = selection.getRangeAt(0);
	if (!editorEl.value.contains(range.startContainer) || !editorEl.value.contains(range.endContainer)) {
		return lastSelectionRange.value;
	}

	const nextSelection = {
		start: getPointOffset(range.startContainer, range.startOffset),
		end: getPointOffset(range.endContainer, range.endOffset),
	};

	lastSelectionRange.value = nextSelection;
	return nextSelection;
}

function getPointForOffset(targetOffset: number): { node: Node; offset: number } {
	if (editorEl.value == null) {
		throw new Error('Editor root not mounted');
	}

	const editor = editorEl.value;
	let remaining = Math.max(0, Math.min(targetOffset, getCurrentText().length));

	const walk = (node: Node): { node: Node; offset: number } | null => {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent ?? '';
			const length = getRawTextLength(text);
			if (remaining <= length) {
				return { node, offset: getDomOffsetForRawTextOffset(text, remaining) };
			}
			remaining -= length;
			return null;
		}

		if (node instanceof HTMLBRElement) {
			const parent = node.parentNode ?? editor;
			const index = Array.from(parent.childNodes).indexOf(node);
			if (remaining <= 1) {
				return { node: parent, offset: remaining === 0 ? index : index + 1 };
			}
			remaining -= 1;
			return null;
		}

		if (node instanceof HTMLElement && node.dataset.raw != null) {
			const parent = node.parentNode ?? editor;
			const index = Array.from(parent.childNodes).indexOf(node);
			const rawLength = node.dataset.raw.length;
			if (remaining <= rawLength) {
				if (remaining === 0) {
					return { node: parent, offset: index };
				}
				return getTokenCaretAnchorPoint(node) ?? { node: parent, offset: index + 1 };
			}
			remaining -= rawLength;
			return null;
		}

		for (const child of Array.from(node.childNodes)) {
			const result = walk(child);
			if (result != null) {
				return result;
			}
		}

		return null;
	};

	for (const child of Array.from(editor.childNodes)) {
		const result = walk(child);
		if (result != null) {
			return result;
		}
	}

	return { node: editor, offset: editor.childNodes.length };
}

function setSelectionRange(start: number, end: number) {
	if (editorEl.value == null) return;

	const selection = window.getSelection();
	if (selection == null) return;

	const range = window.document.createRange();
	const startPoint = getPointForOffset(start);
	const endPoint = getPointForOffset(end);

	range.setStart(startPoint.node, startPoint.offset);
	range.setEnd(endPoint.node, endPoint.offset);

	selection.removeAllRanges();
	selection.addRange(range);

	lastSelectionRange.value = {
		start: Math.max(0, Math.min(start, getCurrentText().length)),
		end: Math.max(0, Math.min(end, getCurrentText().length)),
	};
}

function rememberSelection() {
	if (!focused.value) return;
	getSelectionRange();
}

function isInTokenCaretAnchor(node: Node | null) {
	let current: Node | null = node;

	while (current != null && current !== editorEl.value) {
		if (current instanceof HTMLElement && current.dataset.caretAnchor === 'true') {
			return true;
		}
		current = current.parentNode;
	}

	return false;
}

function isSelectionInTokenCaretAnchor() {
	const selection = window.getSelection();
	if (selection == null || selection.rangeCount === 0 || editorEl.value == null) return false;

	const range = selection.getRangeAt(0);
	if (!editorEl.value.contains(range.startContainer) || !editorEl.value.contains(range.endContainer)) return false;

	return isInTokenCaretAnchor(range.startContainer) || isInTokenCaretAnchor(range.endContainer);
}

function getTokenCaretOffsetFromPointer(ev: PointerEvent) {
	if (editorEl.value == null) return null;

	const tokenEls = Array.from(editorEl.value.querySelectorAll<HTMLElement>('[data-raw]'));
	let best: { offset: number; distance: number } | null = null;

	for (const tokenEl of tokenEls) {
		const raw = tokenEl.dataset.raw;
		if (raw == null) continue;

		const rects = Array.from(tokenEl.getClientRects());
		for (const rect of rects) {
			const verticalTolerance = Math.max(4, rect.height * 0.35);
			if (ev.clientY < rect.top - verticalTolerance || ev.clientY > rect.bottom + verticalTolerance) continue;

			const start = getPointOffset(tokenEl, 0);
			const end = start + raw.length;
			const midpoint = rect.left + (rect.width / 2);
			const offset = ev.clientX < midpoint ? start : end;
			const boundary = ev.clientX < midpoint ? rect.left : rect.right;
			const distance = Math.abs(ev.clientX - boundary);
			const horizontalTolerance = Math.max(10, rect.width * 0.75);

			if (distance > horizontalTolerance) continue;
			if (best == null || distance < best.distance) {
				best = { offset, distance };
			}
		}
	}

	return best?.offset ?? null;
}

function focus() {
	editorEl.value?.focus();
}

function blur() {
	editorEl.value?.blur();
}

function applyTextUpdate(value: string, selectionStart: number, selectionEnd = selectionStart, options: ApplyTextUpdateOptions = {}) {
	if (options.skipNextInputNormalization) {
		skipInputNormalizationUntilRender = true;
	}

	renderedText.value = value;
	emit('update:modelValue', value);
	lastSelectionRange.value = { start: selectionStart, end: selectionEnd };

	nextTick(() => {
		renderEditorContent({ start: selectionStart, end: selectionEnd });
		focus();
		setSelectionRange(selectionStart, selectionEnd);
		if (options.skipNextInputNormalization) {
			skipInputNormalizationUntilRender = false;
		}
	});
}

function replaceSelection(value: string, options: ApplyTextUpdateOptions = {}) {
	const { start, end } = getSelectionRange();
	replaceRange(start, end, value, options);
}

function replaceRange(start: number, end: number, value: string, options: ApplyTextUpdateOptions = {}) {
	const nextText = renderedText.value.slice(0, start) + value + renderedText.value.slice(end);
	const nextCursor = start + value.length;
	applyTextUpdate(nextText, nextCursor, nextCursor, options);
}

function deleteBackward(options: ApplyTextUpdateOptions = {}) {
	const { start, end } = getSelectionRange();
	if (start !== end) {
		replaceRange(start, end, '', options);
		return;
	}
	if (start === 0) return;

	const token = getTokenBefore(start);
	const deleteStart = token?.start ?? Math.max(0, start - 1);
	replaceRange(deleteStart, end, '', options);
}

function deleteForward(options: ApplyTextUpdateOptions = {}) {
	const { start, end } = getSelectionRange();
	if (start !== end) {
		replaceRange(start, end, '', options);
		return;
	}
	if (end >= renderedText.value.length) return;

	const token = getTokenAfter(end);
	const deleteEnd = token?.end ?? Math.min(renderedText.value.length, end + 1);
	replaceRange(start, deleteEnd, '', options);
}

function normalizeFromDom() {
	const selection = focused.value ? getSelectionRange() : lastSelectionRange.value;
	const nextText = getCurrentText();
	renderedText.value = nextText;
	emit('update:modelValue', nextText);

	nextTick(() => {
		renderEditorContent(selection);
	});
}

function getSelectedText() {
	const { start, end } = getSelectionRange();
	const text = renderedText.value;
	return text.slice(Math.min(start, end), Math.max(start, end));
}

function getAutocompleteTarget(): AutocompleteTarget {
	return {
		get value() {
			return skipInputNormalizationUntilRender ? renderedText.value : getCurrentText();
		},
		get selectionStart() {
			return skipInputNormalizationUntilRender ? lastSelectionRange.value.start : getSelectionRange().start;
		},
		get selectionEnd() {
			return skipInputNormalizationUntilRender ? lastSelectionRange.value.end : getSelectionRange().end;
		},
		get scrollLeft() {
			return editorEl.value?.scrollLeft ?? 0;
		},
		get scrollTop() {
			return editorEl.value?.scrollTop ?? 0;
		},
		addEventListener(...args: Parameters<HTMLElement['addEventListener']>) {
			editorEl.value?.addEventListener(...args);
		},
		removeEventListener(...args: Parameters<HTMLElement['removeEventListener']>) {
			editorEl.value?.removeEventListener(...args);
		},
		getBoundingClientRect() {
			return editorEl.value?.getBoundingClientRect() ?? new DOMRect();
		},
		focus,
		setSelectionRange,
		applyTextUpdate,
		getCaretCoordinates() {
			if (editorEl.value == null) return { left: 0, top: 0 };

			const { start } = getSelectionRange();
			const point = getPointForOffset(start);
			const range = window.document.createRange();
			range.setStart(point.node, point.offset);
			range.collapse(true);

			const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
			const editorRect = editorEl.value.getBoundingClientRect();
			if (rect == null || (rect.width === 0 && rect.height === 0 && editorEl.value.childNodes.length === 0)) {
				const computedStyle = window.getComputedStyle(editorEl.value);
				return {
					left: parseFloat(computedStyle.paddingLeft || '0'),
					top: parseFloat(computedStyle.paddingTop || '0'),
				};
			}

			return {
				left: rect.left - editorRect.left + editorEl.value.scrollLeft,
				top: rect.top - editorRect.top + editorEl.value.scrollTop,
			};
		},
	};
}

function onFocus() {
	focused.value = true;
	rememberSelection();
}

function onBlur() {
	focused.value = false;
	if (!composing.value) {
		normalizeFromDom();
	}
}

function onInput() {
	if (props.disabled || props.readonly) return;
	if (composing.value) return;
	if (skipInputNormalizationUntilRender) return;

	if (getCurrentText() !== renderedText.value) {
		normalizeFromDom();
	}
}

function onPointerDown(ev: PointerEvent) {
	if (props.disabled || props.readonly || composing.value || ev.button !== 0 || ev.shiftKey) return;

	const offset = getTokenCaretOffsetFromPointer(ev);
	if (offset == null) return;

	ev.preventDefault();
	focus();
	setSelectionRange(offset, offset);
}

function onBeforeInput(ev: InputEvent) {
	if (props.disabled || props.readonly || composing.value) return;

	const selection = getSelectionRange();
	const start = Math.min(selection.start, selection.end);
	const end = Math.max(selection.start, selection.end);

	switch (ev.inputType) {
		case 'insertText':
		case 'insertReplacementText':
			if (isSelectionInTokenCaretAnchor()) {
				ev.preventDefault();
				replaceRange(start, end, ev.data ?? '', { skipNextInputNormalization: true });
				return;
			}
			if (start !== end && rangeIntersectsToken(start, end)) {
				ev.preventDefault();
				replaceRange(start, end, ev.data ?? '', { skipNextInputNormalization: true });
			}
			return;

		case 'insertParagraph':
		case 'insertLineBreak':
			ev.preventDefault();
			replaceSelection('\n', { skipNextInputNormalization: true });
			return;

		case 'deleteContentBackward':
			if ((start !== end && rangeIntersectsToken(start, end)) || getTokenBefore(start) != null) {
				ev.preventDefault();
				deleteBackward({ skipNextInputNormalization: true });
			}
			return;

		case 'deleteContentForward':
			if ((start !== end && rangeIntersectsToken(start, end)) || getTokenAfter(end) != null) {
				ev.preventDefault();
				deleteForward({ skipNextInputNormalization: true });
			}
			return;

		case 'historyUndo':
		case 'historyRedo':
			ev.preventDefault();
			return;
	}
}

function onKeydown(ev: KeyboardEvent) {
	emit('keydown', ev);
	if (ev.defaultPrevented || props.disabled || props.readonly) return;

	if (!ev.isComposing && ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
		ev.preventDefault();
		return;
	}

	if (!ev.isComposing && ev.key === 'Enter' && !ev.ctrlKey && !ev.metaKey) {
		ev.preventDefault();
		replaceSelection('\n', { skipNextInputNormalization: true });
	}
}

function onKeyup(ev: KeyboardEvent) {
	emit('keyup', ev);
	rememberSelection();
}

function onPaste(ev: ClipboardEvent) {
	emit('paste', ev);
	if (ev.defaultPrevented || props.disabled || props.readonly) return;

	ev.preventDefault();
	replaceSelection(ev.clipboardData?.getData('text') ?? '', { skipNextInputNormalization: true });
}

function onCopy(ev: ClipboardEvent) {
	const text = getSelectedText();
	if (text === '') return;
	ev.preventDefault();
	ev.clipboardData?.setData('text/plain', text);
}

function onCut(ev: ClipboardEvent) {
	if (props.disabled || props.readonly) return;

	const text = getSelectedText();
	if (text === '') return;

	ev.preventDefault();
	ev.clipboardData?.setData('text/plain', text);
	replaceSelection('', { skipNextInputNormalization: true });
}

function onCompositionStart() {
	composing.value = true;
}

function onCompositionUpdate(ev: CompositionEvent) {
	emit('compositionupdate', ev);
}

function onCompositionEnd(ev: CompositionEvent) {
	composing.value = false;
	emit('compositionend', ev);
	normalizeFromDom();
}

defineExpose({
	rootEl: editorEl,
	getRootEl: () => editorEl.value,
	focus,
	blur,
	rememberSelection,
	getSelectionRange,
	setSelectionRange,
	replaceSelection,
	applyTextUpdate,
	getAutocompleteTarget,
});
</script>

<style lang="scss" module>
.editor {
	display: block;
	width: 100%;
	white-space: pre-wrap;
	overflow-wrap: break-word;
	word-break: break-word;
	outline: none;
	caret-color: var(--MI_THEME-fg);

	&[contenteditable='false'] {
		cursor: default;
	}

	&[data-disabled='true'] {
		opacity: 0.5;
	}

	&[data-empty='true']::before {
		content: attr(data-placeholder);
		color: color(from var(--MI_THEME-fg) srgb r g b / 0.5);
		pointer-events: none;
	}
}

.customEmoji {
	display: inline-flex;
	align-items: center;
	pointer-events: none;
	user-select: text;
	-webkit-user-select: text;
}

.customEmojiImage {
	height: 1.25em;
	vertical-align: -0.25em;
}

.unicodeEmoji {
	display: inline-flex;
	align-items: center;
	pointer-events: none;
	user-select: text;
	-webkit-user-select: text;
}

.unicodeEmojiImage {
	height: 1.25em;
	vertical-align: -0.25em;
}

.tokenCaretAnchor {
	display: inline-block;
	width: 0.35em;
	margin: 0 -0.175em;
	overflow: hidden;
	vertical-align: baseline;
	user-select: text;
	-webkit-user-select: text;
}
</style>
