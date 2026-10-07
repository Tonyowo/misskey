/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { shouldOpenNoteOnClick } from '@/utility/note-click.js';

function createCard(content: string) {
	const card = document.createElement('article');
	card.setAttribute('role', 'link');
	card.tabIndex = 0;
	card.innerHTML = content;
	document.body.append(card);
	const open = vi.fn();
	card.addEventListener('click', ev => {
		if (shouldOpenNoteOnClick(ev)) open();
	});
	return { card, open };
}

function click(target: Element, options: MouseEventInit = {}) {
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, ...options }));
}

afterEach(() => {
	document.body.replaceChildren();
	window.getSelection()?.removeAllRanges();
});

describe('opening notes from their body', () => {
	test('opens on plain text and empty card space, even when the card itself is a link', () => {
		const { card, open } = createCard('<p><span>Post body</span></p>');
		click(card.querySelector('span')!);
		click(card);
		expect(open).toHaveBeenCalledTimes(2);
	});

	test.each([
		'<a href="/users/alice"><span>Profile</span></a>',
		'<button><span>React</span></button>',
		'<button disabled><span>Disabled</span></button>',
		'<a href="/notes/another"><svg><path></path></svg></a>',
		'<input value="Edit">',
		'<textarea>Edit</textarea>',
		'<select><option>Choose</option></select>',
		'<details><summary><span>Files</span></summary></details>',
		'<div role="button"><span>Image viewer</span></div>',
		'<div data-note-click-ignore><span>Poll choice</span></div>',
		'<div data-note-click-ignore><span>Quoted note</span></div>',
		'<div tabindex="0"><span>Interactive widget</span></div>',
		'<div contenteditable="true"><span>Edit</span></div>',
		'<span alt="emoji">❤️</span>',
		'<img alt="emoji">',
		'<video controls></video>',
		'<audio controls></audio>',
	])('preserves the action of interactive content: %s', content => {
		const { card, open } = createCard(content);
		const target = card.querySelector('span, path, input, textarea, option, img, video, audio')!;
		click(target);
		expect(open).not.toHaveBeenCalled();
	});

	test('does not open while selecting text', () => {
		const { card, open } = createCard('<p>Selectable text</p>');
		const paragraph = card.querySelector('p')!;
		const range = document.createRange();
		range.selectNodeContents(paragraph);
		window.getSelection()?.addRange(range);
		click(paragraph);
		expect(open).not.toHaveBeenCalled();
	});

	test.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { button: 1 }, { button: 2 }])('ignores modified and non-primary clicks: %o', options => {
		const { card, open } = createCard('<p>Post</p>');
		click(card, options);
		expect(open).not.toHaveBeenCalled();
	});

	test('does not navigate after a child handles or cancels the click', () => {
		const { card, open } = createCard('<span>Interactive text</span>');
		const target = card.querySelector('span')!;
		target.addEventListener('click', ev => ev.preventDefault());
		click(target);
		expect(open).not.toHaveBeenCalled();
	});
});
