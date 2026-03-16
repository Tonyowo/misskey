/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type RectLike = Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>;

export function calculateNestedMenuPosition(params: {
	rootRect: RectLike;
	parentRect: RectLike;
	menuRect: RectLike;
	anchorWidth: number;
	viewportWidth: number;
	viewportHeight: number;
	viewportMargin?: number;
	scrollbarThickness?: number;
}) {
	const {
		rootRect,
		parentRect,
		menuRect,
		anchorWidth,
		viewportWidth,
		viewportHeight,
		viewportMargin = 16,
		scrollbarThickness = 16,
	} = params;

	const leftBoundary = viewportMargin;
	const rightBoundary = viewportWidth - scrollbarThickness - viewportMargin;
	const bottomBoundary = viewportHeight - scrollbarThickness;

	let left = anchorWidth;
	let top = (parentRect.top - rootRect.top) - 8;

	// Keep the desktop-style cascade when possible, then fall back to the left.
	if (rootRect.left + left + menuRect.width > rightBoundary) {
		left = -menuRect.width;
	}

	// If the flipped menu would still leave the viewport, pull it back just enough
	// to keep the whole flyout visible while preserving as much separation as possible.
	if (rootRect.left + left < leftBoundary) {
		left += leftBoundary - (rootRect.left + left);
	}
	if (rootRect.left + left + menuRect.width > rightBoundary) {
		left -= (rootRect.left + left + menuRect.width) - rightBoundary;
	}
	if (rootRect.top + top + menuRect.height >= bottomBoundary) {
		top -= (rootRect.top + top + menuRect.height) - bottomBoundary;
	}
	if (rootRect.top + top < viewportMargin) {
		top += viewportMargin - (rootRect.top + top);
	}

	return { left, top };
}
