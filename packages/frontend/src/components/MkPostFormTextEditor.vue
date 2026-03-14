<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	ref="editorEl"
	v-bind="attrs"
	:class="[$style.root, { [$style.empty]: text === '', [$style.disabled]: disabled || readonly }]"
	:contenteditable="(!disabled && !readonly).toString()"
	:data-empty="text === ''"
	:data-placeholder="placeholder ?? ''"
	role="textbox"
	aria-multiline="true"
	:aria-disabled="disabled || readonly"
	:aria-readonly="readonly"
	:tabindex="disabled ? -1 : 0"
	@focus="focused = true"
	@blur="focused = false"
	@beforeinput="onBeforeInput"
	@input="onInput"
	@keydown="onEditorKeydown"
	@keyup="onEditorKeyup"
	@paste="onEditorPaste"
	@copy="onEditorCopy"
	@cut="onEditorCut"
	@compositionstart="onCompositionStart"
	@compositionupdate="emit('compositionupdate', $event)"
	@compositionend="onCompositionEnd"
>
	<template v-for="(segment, index) in segments" :key="`${index}:${segment.start}`">
		<span
			v-if="segment.type === 'text'"
			data-editor-segment="true"
			data-kind="text"
			:data-start="segment.start"
			:data-end="segment.end"
		>{{ segment.value }}</span>
		<span
			v-else
			:class="$style.emojiToken"
			data-editor-segment="true"
			data-kind="emoji"
			:data-code="segment.code"
			:data-start="segment.start"
			:data-end="segment.end"
			contenteditable="false"
		>
			<MkCustomEmoji
				:name="segment.name"
				normal
				:fallbackToImage="false"
				ignoreMuted
			/>
		</span>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, useTemplateRef, watch } from 'vue';
import * as mfm from 'mfm-js';
import { toASCII } from 'punycode.js';
import type { Ref } from 'vue';
import type { CompleteInfo } from '@/components/MkAutocomplete.vue';
import type { SuggestionType } from '@/utility/autocomplete.js';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import { customEmojisMap } from '@/custom-emojis.js';
import { popup } from '@/os.js';

defineOptions({
	inheritAttrs: false,
});

type Segment =
	| { type: 'text'; value: string; start: number; end: number }
	| { type: 'customEmoji'; name: string; code: string; start: number; end: number };

type SelectionRange = {
	start: number;
	end: number;
};

type CompleteProps<T extends keyof CompleteInfo> = {
	type: T;
	value: CompleteInfo[T]['payload'];
};

function isCompleteType<T extends keyof CompleteInfo>(expectedType: T, props: CompleteProps<keyof CompleteInfo>): props is CompleteProps<T> {
	return props.type === expectedType;
}

const props = withDefaults(defineProps<{
	modelValue: string;
	disabled?: boolean;
	readonly?: boolean;
	placeholder?: string;
	autofocus?: boolean;
	autocompleteTypes?: SuggestionType[];
}>(), {
	modelValue: '',
	disabled: false,
	readonly: false,
	placeholder: undefined,
	autofocus: false,
	autocompleteTypes: () => ['user', 'hashtag', 'emoji', 'mfmTag', 'mfmParam'],
});

const emit = defineEmits<{
	(ev: 'update:modelValue', value: string): void;
	(ev: 'keydown', _ev: KeyboardEvent): void;
	(ev: 'keyup', _ev: KeyboardEvent): void;
	(ev: 'paste', _ev: ClipboardEvent): void;
	(ev: 'compositionupdate', _ev: CompositionEvent): void;
	(ev: 'compositionend', _ev: CompositionEvent): void;
}>();

const attrs = useAttrs();
const editorEl = useTemplateRef('editorEl');
const text = ref(props.modelValue ?? '');
const focused = ref(false);
const isComposing = ref(false);
const lastSelection = ref<SelectionRange>({ start: text.value.length, end: text.value.length });

let currentAutocompleteType: keyof CompleteInfo | undefined;
let autocompleteOpening = false;
let autocompletePopup: {
	x: Ref<number>;
	y: Ref<number>;
	q: Ref<any>;
	close: () => void;
} | null = null;

const segments = computed<Segment[]>(() => {
	const value = text.value ?? '';
	if (value === '') return [];

	const result: Segment[] = [];
	let currentText = '';
	let cursor = 0;
	let tokens: ReturnType<typeof mfm.parseSimple>;

	try {
		tokens = mfm.parseSimple(value);
	} catch {
		return [{
			type: 'text',
			value,
			start: 0,
			end: value.length,
		}];
	}

	const flushText = () => {
		if (currentText === '') return;
		result.push({
			type: 'text',
			value: currentText,
			start: cursor,
			end: cursor + currentText.length,
		});
		cursor += currentText.length;
		currentText = '';
	};

	const appendText = (chunk: string) => {
		if (chunk === '') return;
		currentText += chunk;
	};

	for (const token of tokens) {
		switch (token.type) {
			case 'text': {
				appendText(token.props.text);
				break;
			}

			case 'unicodeEmoji': {
				appendText(token.props.emoji);
				break;
			}

			case 'mention': {
				appendText(`@${token.props.username}${token.props.host ? `@${toASCII(token.props.host)}` : ''}`);
				break;
			}

			case 'hashtag': {
				appendText(`#${token.props.hashtag}`);
				break;
			}

			case 'url': {
				appendText(token.props.url);
				break;
			}

			case 'emojiCode': {
				const emojiName = token.props.name;
				const emojiCode = `:${emojiName}:`;

				if (!emojiName.includes('@') && !customEmojisMap.has(emojiName)) {
					appendText(emojiCode);
					break;
				}

				flushText();
				result.push({
					type: 'customEmoji',
					name: emojiName,
					code: emojiCode,
					start: cursor,
					end: cursor + emojiCode.length,
				});
				cursor += emojiCode.length;
				break;
			}
		}
	}

	flushText();

	return result;
});

function serializeNode(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return node.textContent ?? '';
	}

	if (!(node instanceof HTMLElement) && !(node instanceof DocumentFragment)) {
		return '';
	}

	if (node instanceof HTMLElement) {
		if (node.dataset.kind === 'emoji' && node.dataset.code) {
			return node.dataset.code;
		}

		if (node.tagName === 'BR') {
			return '\n';
		}
	}

	return Array.from(node.childNodes).map(serializeNode).join('');
}

function getSelectionFromDom(): SelectionRange {
	const root = editorEl.value;
	const selection = window.getSelection();

	if (root == null || selection == null || selection.rangeCount === 0) {
		return lastSelection.value;
	}

	const range = selection.getRangeAt(0);
	if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
		return lastSelection.value;
	}

	const startRange = document.createRange();
	startRange.setStart(root, 0);
	startRange.setEnd(range.startContainer, range.startOffset);

	const endRange = document.createRange();
	endRange.setStart(root, 0);
	endRange.setEnd(range.endContainer, range.endOffset);

	const nextSelection = {
		start: serializeNode(startRange.cloneContents()).length,
		end: serializeNode(endRange.cloneContents()).length,
	};

	lastSelection.value = nextSelection;
	return nextSelection;
}

function getNodeSourceLength(node: Node): number {
	return serializeNode(node).length;
}

function resolveOffset(offset: number): { node: Node; offset: number } {
	const root = editorEl.value;
	if (root == null) {
		throw new Error('Editor element is not available.');
	}

	const targetOffset = Math.max(0, Math.min(offset, text.value.length));
	let consumed = 0;

	for (let index = 0; index < root.childNodes.length; index++) {
		const child = root.childNodes[index];
		const childLength = getNodeSourceLength(child);
		const nextConsumed = consumed + childLength;

		if (targetOffset < nextConsumed) {
			if (child instanceof HTMLElement && child.dataset.kind === 'emoji') {
				return targetOffset === consumed
					? { node: root, offset: index }
					: { node: root, offset: index + 1 };
			}

			const textNode = child.firstChild;
			if (textNode?.nodeType === Node.TEXT_NODE) {
				return {
					node: textNode,
					offset: Math.max(0, Math.min(targetOffset - consumed, textNode.textContent?.length ?? 0)),
				};
			}

			return { node: root, offset: index };
		}

		if (targetOffset === nextConsumed) {
			if (child instanceof HTMLElement && child.dataset.kind === 'emoji') {
				return { node: root, offset: index + 1 };
			}

			const textNode = child.firstChild;
			if (textNode?.nodeType === Node.TEXT_NODE) {
				return {
					node: textNode,
					offset: textNode.textContent?.length ?? 0,
				};
			}

			return { node: root, offset: index + 1 };
		}

		consumed = nextConsumed;
	}

	return { node: root, offset: root.childNodes.length };
}

function focus() {
	editorEl.value?.focus();
}

function setSelectionRange(start: number, end = start) {
	const root = editorEl.value;
	if (root == null) return;

	const normalizedStart = Math.max(0, Math.min(start, text.value.length));
	const normalizedEnd = Math.max(0, Math.min(end, text.value.length));
	const startPoint = resolveOffset(normalizedStart);
	const endPoint = resolveOffset(normalizedEnd);
	const selection = window.getSelection();

	if (selection == null) return;

	const range = document.createRange();
	range.setStart(startPoint.node, startPoint.offset);
	range.setEnd(endPoint.node, endPoint.offset);
	selection.removeAllRanges();
	selection.addRange(range);

	lastSelection.value = {
		start: normalizedStart,
		end: normalizedEnd,
	};
}

function getSelectionRange() {
	return getSelectionFromDom();
}

function queueSelectionRestore(selection: SelectionRange | null, options: {
	focusEditor?: boolean;
} = {}) {
	nextTick(() => {
		if (selection == null) return;
		if (!options.focusEditor && !focused.value) return;
		if (options.focusEditor) {
			focus();
		}
		setSelectionRange(selection.start, selection.end);
		updateAutocomplete();
	});
}

function commitText(nextText: string, selection: SelectionRange | null, options: {
	focusEditor?: boolean;
} = {}) {
	text.value = nextText;
	emit('update:modelValue', nextText);
	queueSelectionRestore(selection, options);
}

function replaceSelection(insertedText: string, selection = getSelectionRange()) {
	const start = Math.min(selection.start, selection.end);
	const end = Math.max(selection.start, selection.end);
	const nextText = `${text.value.slice(0, start)}${insertedText}${text.value.slice(end)}`;
	const nextSelection = {
		start: start + insertedText.length,
		end: start + insertedText.length,
	};

	commitText(nextText, nextSelection, { focusEditor: true });
}

function deleteBackward(selection = getSelectionRange()) {
	const start = Math.min(selection.start, selection.end);
	const end = Math.max(selection.start, selection.end);

	if (start !== end) {
		commitText(`${text.value.slice(0, start)}${text.value.slice(end)}`, { start, end: start }, { focusEditor: true });
		return;
	}

	if (start === 0) return;

	const emojiSegment = segments.value.find(segment => segment.type === 'customEmoji' && segment.end === start);
	const deleteStart = emojiSegment?.start ?? start - 1;
	commitText(`${text.value.slice(0, deleteStart)}${text.value.slice(end)}`, { start: deleteStart, end: deleteStart }, { focusEditor: true });
}

function deleteForward(selection = getSelectionRange()) {
	const start = Math.min(selection.start, selection.end);
	const end = Math.max(selection.start, selection.end);

	if (start !== end) {
		commitText(`${text.value.slice(0, start)}${text.value.slice(end)}`, { start, end: start }, { focusEditor: true });
		return;
	}

	if (start >= text.value.length) return;

	const emojiSegment = segments.value.find(segment => segment.type === 'customEmoji' && segment.start === start);
	const deleteEnd = emojiSegment?.end ?? start + 1;
	commitText(`${text.value.slice(0, start)}${text.value.slice(deleteEnd)}`, { start, end: start }, { focusEditor: true });
}

function closeAutocomplete() {
	if (autocompletePopup == null) return;

	autocompletePopup.close();
	autocompletePopup = null;
	currentAutocompleteType = undefined;
}

function getCaretPosition() {
	const root = editorEl.value;
	const selection = window.getSelection();
	if (root == null || selection == null || selection.rangeCount === 0) return null;

	const range = selection.getRangeAt(0).cloneRange();
	if (!range.collapsed || !root.contains(range.startContainer)) return null;

	let rect = range.getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0) {
		rect = range.getClientRects().item(0) ?? root.getBoundingClientRect();
	}

	return {
		x: rect.left,
		y: rect.top,
	};
}

async function openAutocomplete<T extends keyof CompleteInfo>(type: T, q: CompleteInfo[T]['query']) {
	if (editorEl.value == null) return;
	if (type !== currentAutocompleteType) {
		closeAutocomplete();
	}
	if (autocompleteOpening) return;
	autocompleteOpening = true;
	currentAutocompleteType = type;

	const caretPosition = getCaretPosition() ?? {
		x: editorEl.value.getBoundingClientRect().left,
		y: editorEl.value.getBoundingClientRect().top,
	};

	if (autocompletePopup) {
		autocompletePopup.x.value = caretPosition.x;
		autocompletePopup.y.value = caretPosition.y;
		autocompletePopup.q.value = q;
		autocompleteOpening = false;
		return;
	}

	const x = ref(caretPosition.x);
	const y = ref(caretPosition.y);
	const _q = ref(q);

	const { dispose } = popup(defineAsyncComponent(() => import('@/components/MkAutocomplete.vue')), {
		textarea: editorEl.value as HTMLElement & HTMLTextAreaElement,
		close: closeAutocomplete,
		type,
		//@ts-expect-error popup does not support generic component props
		q: _q,
		x,
		y,
	}, {
		done: (res) => {
			completeAutocomplete(res);
		},
	});

	autocompletePopup = {
		q: _q,
		x,
		y,
		close: () => dispose(),
	};

	autocompleteOpening = false;
}

function updateAutocomplete() {
	if (props.disabled || props.readonly || isComposing.value) {
		closeAutocomplete();
		return;
	}

	const selection = getSelectionRange();
	if (selection.start !== selection.end) {
		closeAutocomplete();
		return;
	}

	const caretPos = selection.start;
	const currentLine = text.value.substring(0, caretPos).split('\n').pop() ?? '';
	const mentionCandidate = currentLine.split(/[^a-zA-Z0-9_@.\-]+/).pop() ?? '';

	const mentionIndex = mentionCandidate.lastIndexOf('@');
	const hashtagIndex = currentLine.lastIndexOf('#');
	const emojiIndex = currentLine.lastIndexOf(':');
	const mfmTagIndex = currentLine.lastIndexOf('$');
	const mfmParamIndex = currentLine.lastIndexOf('.');

	const max = Math.max(mentionIndex, hashtagIndex, emojiIndex, mfmTagIndex);

	if (max === -1) {
		closeAutocomplete();
		return;
	}

	const afterLastMfmParam = currentLine.split(/\$\[[a-zA-Z]+/).pop();

	const maybeMention = mentionIndex !== -1;
	const isHashtag = hashtagIndex !== -1;
	const isMfmParam = mfmParamIndex !== -1 && afterLastMfmParam?.includes('.') && !afterLastMfmParam.includes(' ');
	const isMfmTag = mfmTagIndex !== -1 && !isMfmParam;
	const isEmoji = emojiIndex !== -1 && currentLine.split(/:[a-z0-9_+\-]+:/).pop()?.includes(':');
	const isEmojiCompleteToUnicode = !isEmoji && emojiIndex === currentLine.length - 1;

	let opened = false;

	if (maybeMention && !opened && props.autocompleteTypes.includes('user')) {
		const mentionIndexAlt = mentionCandidate.lastIndexOf('@', mentionIndex - 1);
		const mentionIndexLeft = (mentionIndexAlt !== -1 && mentionIndexAlt !== mentionIndex - 1) ? mentionIndexAlt : mentionIndex;
		const isMention = mentionIndexLeft === 0 || '_@.-'.includes(mentionCandidate[mentionIndexLeft - 1]);

		if (isMention) {
			const username = mentionCandidate.substring(mentionIndexLeft + 1);
			if (username !== '' && username.match(/^[a-zA-Z0-9_@.\-]+$/)) {
				openAutocomplete('user', username);
				opened = true;
			} else if (username === '') {
				openAutocomplete('user', null);
				opened = true;
			}
		}
	}

	if (isHashtag && !opened && props.autocompleteTypes.includes('hashtag')) {
		const hashtag = currentLine.substring(hashtagIndex + 1);
		if (!hashtag.includes(' ')) {
			openAutocomplete('hashtag', hashtag);
			opened = true;
		}
	}

	if (isEmoji && !opened && props.autocompleteTypes.includes('emoji')) {
		const emoji = currentLine.substring(emojiIndex + 1);
		if (!emoji.includes(' ')) {
			openAutocomplete('emoji', emoji);
			opened = true;
		}
	}

	if (isEmojiCompleteToUnicode && !opened && props.autocompleteTypes.includes('emoji')) {
		const emoji = currentLine.substring(currentLine.lastIndexOf(':', currentLine.length - 2) + 1, currentLine.length - 1);
		if (!emoji.includes(' ')) {
			openAutocomplete('emojiComplete', emoji);
			opened = true;
		}
	}

	if (isMfmTag && !opened && props.autocompleteTypes.includes('mfmTag')) {
		const mfmTag = currentLine.substring(mfmTagIndex + 1);
		if (!mfmTag.includes(' ')) {
			openAutocomplete('mfmTag', mfmTag.replace('[', ''));
			opened = true;
		}
	}

	if (isMfmParam && !opened && props.autocompleteTypes.includes('mfmParam')) {
		const mfmParam = currentLine.substring(mfmParamIndex + 1);
		if (!mfmParam.includes(' ')) {
			openAutocomplete('mfmParam', {
				tag: currentLine.substring(mfmTagIndex + 2, mfmParamIndex),
				params: mfmParam.split(','),
			});
			opened = true;
		}
	}

	if (!opened) {
		closeAutocomplete();
	}
}

function completeAutocomplete<T extends keyof CompleteInfo>(props: CompleteProps<T>) {
	closeAutocomplete();

	const caret = getSelectionRange().end;

	if (isCompleteType('user', props)) {
		const before = text.value.substring(0, caret);
		const trimmedBefore = before.substring(0, before.lastIndexOf('@'));
		const after = text.value.substring(caret);
		const acct = props.value.host === null ? props.value.username : `${props.value.username}@${toASCII(props.value.host)}`;
		const nextText = `${trimmedBefore}@${acct} ${after}`;
		const nextPos = trimmedBefore.length + acct.length + 2;
		commitText(nextText, { start: nextPos, end: nextPos }, { focusEditor: true });
		return;
	}

	if (isCompleteType('hashtag', props)) {
		const before = text.value.substring(0, caret);
		const trimmedBefore = before.substring(0, before.lastIndexOf('#'));
		const after = text.value.substring(caret);
		const nextText = `${trimmedBefore}#${props.value} ${after}`;
		const nextPos = trimmedBefore.length + props.value.length + 2;
		commitText(nextText, { start: nextPos, end: nextPos }, { focusEditor: true });
		return;
	}

	if (isCompleteType('emoji', props)) {
		const before = text.value.substring(0, caret);
		const trimmedBefore = before.substring(0, before.lastIndexOf(':'));
		const after = text.value.substring(caret);
		const nextText = `${trimmedBefore}${props.value}${after}`;
		const nextPos = trimmedBefore.length + props.value.length;
		commitText(nextText, { start: nextPos, end: nextPos }, { focusEditor: true });
		return;
	}

	if (isCompleteType('emojiComplete', props)) {
		const before = text.value.substring(0, caret);
		const trimmedBefore = before.substring(0, before.lastIndexOf(':', before.length - 2));
		const after = text.value.substring(caret);
		const nextText = `${trimmedBefore}${props.value}${after}`;
		const nextPos = trimmedBefore.length + props.value.length;
		commitText(nextText, { start: nextPos, end: nextPos }, { focusEditor: true });
		return;
	}

	if (isCompleteType('mfmTag', props)) {
		const before = text.value.substring(0, caret);
		const trimmedBefore = before.substring(0, before.lastIndexOf('$'));
		const after = text.value.substring(caret);
		const nextText = `${trimmedBefore}$[${props.value} ]${after}`;
		const nextPos = trimmedBefore.length + props.value.length + 3;
		commitText(nextText, { start: nextPos, end: nextPos }, { focusEditor: true });
		return;
	}

	if (isCompleteType('mfmParam', props)) {
		const before = text.value.substring(0, caret);
		const trimmedBefore = before.substring(0, before.lastIndexOf('.'));
		const after = text.value.substring(caret);
		const nextText = `${trimmedBefore}.${props.value}${after}`;
		const nextPos = trimmedBefore.length + props.value.length + 1;
		commitText(nextText, { start: nextPos, end: nextPos }, { focusEditor: true });
	}
}

function syncTextFromDom() {
	const root = editorEl.value;
	if (root == null) return;

	const selection = getSelectionFromDom();
	const nextText = serializeNode(root);

	if (nextText === text.value) {
		queueSelectionRestore(selection);
		return;
	}

	commitText(nextText, selection);
}

function onBeforeInput(ev: InputEvent) {
	if (props.disabled || props.readonly) return;
	if (ev.isComposing || isComposing.value) return;

	switch (ev.inputType) {
		case 'insertText':
		case 'insertReplacementText':
			if (ev.data == null) return;
			ev.preventDefault();
			replaceSelection(ev.data);
			return;

		case 'insertLineBreak':
		case 'insertParagraph':
			ev.preventDefault();
			replaceSelection('\n');
			return;

		case 'deleteContentBackward':
			ev.preventDefault();
			deleteBackward();
			return;

		case 'deleteContentForward':
			ev.preventDefault();
			deleteForward();
			return;

		default:
			return;
	}
}

function onInput() {
	if (isComposing.value) return;
	syncTextFromDom();
}

function onCompositionStart() {
	isComposing.value = true;
}

function onCompositionEnd(ev: CompositionEvent) {
	isComposing.value = false;
	emit('compositionend', ev);
	syncTextFromDom();
}

function onEditorKeydown(ev: KeyboardEvent) {
	emit('keydown', ev);

	if (ev.defaultPrevented || props.disabled || props.readonly) {
		return;
	}

	nextTick(() => {
		lastSelection.value = getSelectionFromDom();
	});
}

function onEditorKeyup(ev: KeyboardEvent) {
	emit('keyup', ev);
	lastSelection.value = getSelectionFromDom();
	updateAutocomplete();
}

function onEditorPaste(ev: ClipboardEvent) {
	emit('paste', ev);
	if (ev.defaultPrevented || props.disabled || props.readonly) return;
	if (ev.clipboardData == null) return;

	const pastedText = ev.clipboardData.getData('text/plain');
	if (pastedText === '') return;

	ev.preventDefault();
	replaceSelection(pastedText);
}

function copySelectionToClipboard(ev: ClipboardEvent) {
	const selection = window.getSelection();
	if (selection == null || selection.rangeCount === 0 || ev.clipboardData == null) return false;

	const range = selection.getRangeAt(0);
	if (range.collapsed || editorEl.value == null || !editorEl.value.contains(range.startContainer) || !editorEl.value.contains(range.endContainer)) {
		return false;
	}

	const offsets = getSelectionFromDom();
	const start = Math.min(offsets.start, offsets.end);
	const end = Math.max(offsets.start, offsets.end);
	const plain = text.value.slice(start, end);
	const htmlRoot = document.createElement('div');
	htmlRoot.append(range.cloneContents());

	ev.clipboardData.setData('text/plain', plain);
	ev.clipboardData.setData('text/html', htmlRoot.innerHTML);
	ev.preventDefault();
	return true;
}

function onEditorCopy(ev: ClipboardEvent) {
	copySelectionToClipboard(ev);
}

function onEditorCut(ev: ClipboardEvent) {
	if (!copySelectionToClipboard(ev) || props.disabled || props.readonly) return;

	const selection = getSelectionRange();
	const start = Math.min(selection.start, selection.end);
	const end = Math.max(selection.start, selection.end);
	const nextText = `${text.value.slice(0, start)}${text.value.slice(end)}`;
	commitText(nextText, { start, end: start }, { focusEditor: true });
}

function onSelectionChange() {
	if (!focused.value) return;

	lastSelection.value = getSelectionFromDom();
}

watch(() => props.modelValue, (value) => {
	if ((value ?? '') === text.value) return;

	text.value = value ?? '';
	if (focused.value && !isComposing.value) {
		queueSelectionRestore(lastSelection.value);
	}
});

onMounted(() => {
	document.addEventListener('selectionchange', onSelectionChange);

	if (props.autofocus) {
		focus();
		queueSelectionRestore({ start: text.value.length, end: text.value.length });
	}
});

onBeforeUnmount(() => {
	document.removeEventListener('selectionchange', onSelectionChange);
	closeAutocomplete();
});

defineExpose({
	focus,
	setSelectionRange,
	getSelectionRange,
	insertText: replaceSelection,
	getElement: () => editorEl.value,
});
</script>

<style lang="scss" module>
.root {
	display: block;
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: break-word;
	word-break: break-word;
	outline: none;
	caret-color: var(--MI_THEME-fg);
	cursor: text;
}

.root[data-empty="true"]::before {
	content: attr(data-placeholder);
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.35);
	pointer-events: none;
}

.empty {
	min-height: 1.4em;
}

.disabled {
	opacity: 0.5;
}

.emojiToken {
	display: inline-flex;
	align-items: center;
	line-height: 1;
	vertical-align: text-bottom;
	user-select: all;
}
</style>
