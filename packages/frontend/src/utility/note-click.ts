/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const interactiveSelector = 'a, button, input, textarea, select, label, summary, video, audio, iframe, img, [alt], [role="button"], [role="link"], [tabindex], [contenteditable]:not([contenteditable="false"]), [data-note-click-ignore]';

export function shouldOpenNoteOnClick(ev: MouseEvent): boolean {
	if (ev.defaultPrevented || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return false;
	if (window.getSelection()?.toString()) return false;

	for (const target of ev.composedPath()) {
		if (target === ev.currentTarget) break;
		if (target instanceof Element && target.matches(interactiveSelector)) return false;
	}

	return true;
}
