/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, nextTick, ref, shallowRef } from 'vue';
import { preferState } from './init';

const customEmoji = {
	name: 'miku',
	url: 'https://example.com/miku.webp',
};

vi.mock('@/custom-emojis.js', () => {
	const customEmojis = shallowRef([customEmoji]);
	const customEmojisMap = new Map([[customEmoji.name, customEmoji]]);

	return {
		customEmojis,
		customEmojisMap,
	};
});

vi.mock('@/utility/media-proxy.js', () => ({
	getProxiedImageUrl: (url: string) => url,
	getStaticImageUrl: (url: string) => url,
}));

describe('MkPostFormTextEditor', () => {
	afterEach(() => {
		cleanup();
		preferState.emojiStyle = undefined;
	});

	test('restores the caret to a text anchor after a trailing custom emoji', async () => {
		const { default: MkPostFormTextEditor } = await import('@/components/MkPostFormTextEditor.vue');
		const editorRef = ref<{ setSelectionRange: (start: number, end: number) => void } | null>(null);
		const Wrapper = defineComponent({
			components: {
				MkPostFormTextEditor,
			},
			setup() {
				return {
					editorRef,
				};
			},
			template: '<MkPostFormTextEditor ref="editorRef" modelValue=":miku:" />',
		});

		const view = render(Wrapper);
		await nextTick();

		const editor = view.getByRole('textbox') as HTMLDivElement;
		assert.strictEqual(editor.childNodes.length, 2);
		assert.instanceOf(editor.childNodes[1], HTMLSpanElement);
		assert.strictEqual((editor.childNodes[1] as HTMLElement).dataset.caretAnchor, 'true');
		assert.strictEqual(editor.childNodes[1].textContent, '\u200b');

		assert.exists(editorRef.value);
		editorRef.value!.setSelectionRange(':miku:'.length, ':miku:'.length);

		const selection = window.getSelection();
		assert.exists(selection);
		assert.instanceOf(selection!.anchorNode, Text);
		assert.strictEqual(selection!.anchorNode?.textContent, '\u200b');
		assert.strictEqual(selection!.anchorOffset, 1);
	});

	test('renders unicode emoji as Fluent Emoji by default while keeping custom emoji images', async () => {
		const { default: MkPostFormTextEditor } = await import('@/components/MkPostFormTextEditor.vue');
		const Wrapper = defineComponent({
			components: {
				MkPostFormTextEditor,
			},
			template: '<MkPostFormTextEditor modelValue="Hi 😀 :miku:" />',
		});

		const view = render(Wrapper);
		await nextTick();

		const editor = view.getByRole('textbox') as HTMLDivElement;
		const imgs = editor.querySelectorAll('img');

		assert.strictEqual(imgs.length, 2);
		assert.strictEqual(imgs[0].getAttribute('alt'), '😀');
		assert.strictEqual(imgs[0].getAttribute('src'), '/fluent-emoji/1f600.png');
		assert.strictEqual(imgs[1].getAttribute('alt'), ':miku:');
		assert.strictEqual(imgs[1].getAttribute('src'), customEmoji.url);
		assert.strictEqual(editor.textContent, 'Hi \u200b \u200b');
		assert.strictEqual(editor.querySelectorAll('[data-caret-anchor="true"]').length, 2);
	});

	test('keeps unicode emoji as text when emoji style is native', async () => {
		preferState.emojiStyle = 'native';
		const { default: MkPostFormTextEditor } = await import('@/components/MkPostFormTextEditor.vue');
		const Wrapper = defineComponent({
			components: {
				MkPostFormTextEditor,
			},
			template: '<MkPostFormTextEditor modelValue="Hi 😀 :miku:" />',
		});

		const view = render(Wrapper);
		await nextTick();

		const editor = view.getByRole('textbox') as HTMLDivElement;
		const imgs = editor.querySelectorAll('img');

		assert.strictEqual(imgs.length, 1);
		assert.strictEqual(imgs[0].getAttribute('alt'), ':miku:');
		assert.strictEqual(editor.textContent, 'Hi 😀 \u200b');
	});

	test('renders unicode emoji as Twemoji when emoji style is twemoji', async () => {
		preferState.emojiStyle = 'twemoji';
		const { default: MkPostFormTextEditor } = await import('@/components/MkPostFormTextEditor.vue');
		const Wrapper = defineComponent({
			components: {
				MkPostFormTextEditor,
			},
			template: '<MkPostFormTextEditor modelValue="Hi 😀" />',
		});

		const view = render(Wrapper);
		await nextTick();

		const editor = view.getByRole('textbox') as HTMLDivElement;
		const img = editor.querySelector('img');

		assert.exists(img);
		assert.strictEqual(img!.getAttribute('alt'), '😀');
		assert.strictEqual(img!.getAttribute('src'), '/twemoji/1f600.svg');
	});

	test('inserts text at a caret anchor between rendered unicode emoji', async () => {
		const { default: MkPostFormTextEditor } = await import('@/components/MkPostFormTextEditor.vue');
		const editorRef = ref<{ setSelectionRange: (start: number, end: number) => void } | null>(null);
		const text = ref('😀😀');
		const Wrapper = defineComponent({
			components: {
				MkPostFormTextEditor,
			},
			setup() {
				return {
					editorRef,
					text,
				};
			},
			template: '<MkPostFormTextEditor ref="editorRef" v-model="text" />',
		});

		const view = render(Wrapper);
		await nextTick();

		const editor = view.getByRole('textbox') as HTMLDivElement;
		editorRef.value!.setSelectionRange('😀'.length, '😀'.length);

		const event = new InputEvent('beforeinput', {
			inputType: 'insertText',
			data: '8',
			bubbles: true,
			cancelable: true,
		});
		editor.dispatchEvent(event);
		await nextTick();
		await nextTick();

		assert.strictEqual(text.value, '😀8😀');
		assert.strictEqual(editor.querySelectorAll('img').length, 2);
		assert.strictEqual(editor.textContent, '\u200b8\u200b');
	});

	test('places the caret between rendered unicode emoji from pointer position', async () => {
		const { default: MkPostFormTextEditor } = await import('@/components/MkPostFormTextEditor.vue');
		const text = ref('😀😀');
		const Wrapper = defineComponent({
			components: {
				MkPostFormTextEditor,
			},
			setup() {
				return {
					text,
				};
			},
			template: '<MkPostFormTextEditor v-model="text" />',
		});

		const view = render(Wrapper);
		await nextTick();

		const editor = view.getByRole('textbox') as HTMLDivElement;
		const tokens = editor.querySelectorAll<HTMLElement>('[data-raw]');
		assert.strictEqual(tokens.length, 2);

		tokens[0].getClientRects = () => [new DOMRect(0, 0, 20, 20)] as unknown as DOMRectList;
		tokens[1].getClientRects = () => [new DOMRect(20, 0, 20, 20)] as unknown as DOMRectList;

		editor.dispatchEvent(new MouseEvent('pointerdown', {
			clientX: 20,
			clientY: 10,
			button: 0,
			bubbles: true,
			cancelable: true,
		}));

		editor.dispatchEvent(new InputEvent('beforeinput', {
			inputType: 'insertText',
			data: '8',
			bubbles: true,
			cancelable: true,
		}));
		await nextTick();
		await nextTick();

		assert.strictEqual(text.value, '😀8😀');
	});
});
