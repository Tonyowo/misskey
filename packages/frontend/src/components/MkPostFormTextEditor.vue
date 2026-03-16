<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	ref="editorEl"
	v-bind="attrs"
	:class="$style.editor"
	:contenteditable="(!disabled && !readonly).toString()"
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
const CUSTOM_EMOJI_CARET_ANCHOR = '\u200b';

function stripCaretAnchors(value: string) {
	return value.replaceAll(CUSTOM_EMOJI_CARET_ANCHOR, '');
}

function getLeadingCaretAnchorLength(value: string) {
	let length = 0;
	while (value[length] === CUSTOM_EMOJI_CARET_ANCHOR) {
		length++;
	}
	return length;
}

function getRawTextLength(value: string, endOffset = value.length) {
	let length = 0;
	for (let i = 0; i < Math.min(endOffset, value.length); i++) {
		if (value[i] !== CUSTOM_EMOJI_CARET_ANCHOR) {
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
		if (value[i] === CUSTOM_EMOJI_CARET_ANCHOR) continue;
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
	const boundaries: Array<{ start: number; end: number; type: 'text' | 'customEmoji' }> = [];
	let cursor = 0;

	for (const segment of getSegments()) {
		const length = segment.value.length;
		boundaries.push({
			start: cursor,
			end: cursor + length,
			type: segment.type,
		});
		cursor += length;
	}

	return boundaries;
}

function rangeIntersectsCustomEmoji(start: number, end: number) {
	return getTokenBoundaries().some(segment => segment.type === 'customEmoji' && start < segment.end && end > segment.start);
}

function getCustomEmojiBefore(offset: number) {
	return getTokenBoundaries().find(segment => segment.type === 'customEmoji' && segment.end === offset);
}

function getCustomEmojiAfter(offset: number) {
	return getTokenBoundaries().find(segment => segment.type === 'customEmoji' && segment.start === offset);
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

onMounted(() => {
	renderEditorContent();
});

function getCustomEmojiImageUrl(name: string): string {
	const rawUrl = customEmojisMap.get(name)?.url ?? `/emoji/${name}.webp`;
	const proxiedUrl = rawUrl.startsWith('/emoji/')
		? rawUrl
		: getProxiedImageUrl(rawUrl, 'emoji', false, true);

	return prefer.s.disableShowingAnimatedImages
		? getStaticImageUrl(proxiedUrl)
		: proxiedUrl;
}

function createCustomEmojiNode(name: string, raw: string): HTMLSpanElement {
	const span = document.createElement('span');
	span.className = cssModule.customEmoji;
	span.dataset.raw = raw;
	span.contentEditable = 'false';

	const img = document.createElement('img');
	img.className = cssModule.customEmojiImage;
	img.src = getCustomEmojiImageUrl(name);
	img.alt = raw;
	img.title = raw;
	img.decoding = 'async';
	img.draggable = false;
	img.style.webkitUserDrag = 'none';
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

function createCustomEmojiCaretAnchorNode() {
	return window.document.createTextNode(CUSTOM_EMOJI_CARET_ANCHOR);
}

function getCustomEmojiCaretAnchorPoint(node: HTMLElement): { node: Node; offset: number } | null {
	const nextSibling = node.nextSibling;
	if (nextSibling?.nodeType !== Node.TEXT_NODE) return null;

	const text = nextSibling.textContent ?? '';
	if (!text.startsWith(CUSTOM_EMOJI_CARET_ANCHOR)) return null;

	return {
		node: nextSibling,
		offset: getLeadingCaretAnchorLength(text),
	};
}

function renderEditorContent(selection: SelectionRange | null = focused.value ? lastSelectionRange.value : null) {
	if (editorEl.value == null || composing.value) return;

	const fragment = document.createDocumentFragment();
	for (const segment of getSegments()) {
		if (segment.type === 'text') {
			fragment.append(document.createTextNode(segment.value));
			continue;
		}

		fragment.append(createCustomEmojiNode(segment.name, segment.value));
		fragment.append(createCustomEmojiCaretAnchorNode());
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
			const parent = node.parentNode ?? editorEl.value;
			const index = Array.from(parent.childNodes).indexOf(node);
			if (remaining <= 1) {
				return { node: parent, offset: remaining === 0 ? index : index + 1 };
			}
			remaining -= 1;
			return null;
		}

		if (node instanceof HTMLElement && node.dataset.raw != null) {
			const parent = node.parentNode ?? editorEl.value;
			const index = Array.from(parent.childNodes).indexOf(node);
			const rawLength = node.dataset.raw.length;
			if (remaining <= rawLength) {
				if (remaining === 0) {
					return { node: parent, offset: index };
				}
				return getCustomEmojiCaretAnchorPoint(node) ?? { node: parent, offset: index + 1 };
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

	for (const child of Array.from(editorEl.value.childNodes)) {
		const result = walk(child);
		if (result != null) {
			return result;
		}
	}

	return { node: editorEl.value, offset: editorEl.value.childNodes.length };
}

function setSelectionRange(start: number, end: number) {
	if (editorEl.value == null) return;

	const selection = window.getSelection();
	if (selection == null) return;

	const range = document.createRange();
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

	const token = getCustomEmojiBefore(start);
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

	const token = getCustomEmojiAfter(end);
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
		addEventListener(type, listener, options) {
			editorEl.value?.addEventListener(type, listener, options);
		},
		removeEventListener(type, listener, options) {
			editorEl.value?.removeEventListener(type, listener, options);
		},
		getBoundingClientRect() {
			return editorEl.value?.getBoundingClientRect() ?? new DOMRect();
		},
		focus,
		setSelectionRange,
		getCaretCoordinates() {
			if (editorEl.value == null) return { left: 0, top: 0 };

			const { start } = getSelectionRange();
			const point = getPointForOffset(start);
			const range = document.createRange();
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

function onBeforeInput(ev: InputEvent) {
	if (props.disabled || props.readonly || composing.value) return;

	const selection = getSelectionRange();
	const start = Math.min(selection.start, selection.end);
	const end = Math.max(selection.start, selection.end);

	switch (ev.inputType) {
		case 'insertText':
		case 'insertReplacementText':
			if (start !== end && rangeIntersectsCustomEmoji(start, end)) {
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
			if ((start !== end && rangeIntersectsCustomEmoji(start, end)) || getCustomEmojiBefore(start) != null) {
				ev.preventDefault();
				deleteBackward({ skipNextInputNormalization: true });
			}
			return;

		case 'deleteContentForward':
			if ((start !== end && rangeIntersectsCustomEmoji(start, end)) || getCustomEmojiAfter(end) != null) {
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
</style>
