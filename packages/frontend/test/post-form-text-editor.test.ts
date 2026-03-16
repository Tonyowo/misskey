/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, nextTick, ref, shallowRef } from 'vue';
import './init';

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
		assert.instanceOf(editor.childNodes[1], Text);
		assert.strictEqual(editor.childNodes[1].textContent, '\u200b');

		assert.exists(editorRef.value);
		editorRef.value!.setSelectionRange(':miku:'.length, ':miku:'.length);

		const selection = window.getSelection();
		assert.exists(selection);
		assert.instanceOf(selection!.anchorNode, Text);
		assert.strictEqual(selection!.anchorNode?.textContent, '\u200b');
		assert.strictEqual(selection!.anchorOffset, 1);
	});
});
