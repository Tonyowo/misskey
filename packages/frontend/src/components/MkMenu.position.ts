/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type RectLike = Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>;

function clampToViewport(left: number, minLeft: number, maxLeft: number) {
	if (minLeft > maxLeft) {
		return minLeft;
	}

	return Math.min(maxLeft, Math.max(minLeft, left));
}

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
	const minLeft = leftBoundary - rootRect.left;
	const maxLeft = rightBoundary - rootRect.left - menuRect.width;
	const rightIdealLeft = anchorWidth;
	const leftIdealLeft = -menuRect.width;
	const rightAdjustedLeft = clampToViewport(rightIdealLeft, minLeft, maxLeft);
	const leftAdjustedLeft = clampToViewport(leftIdealLeft, minLeft, maxLeft);
	const rightOverlap = rightIdealLeft - rightAdjustedLeft;
	const leftOverlap = leftAdjustedLeft - leftIdealLeft;
	const softOverlapLimit = Math.min(anchorWidth * 0.5, menuRect.width * 0.35);

	let left = rightIdealLeft;
	let top = (parentRect.top - rootRect.top) - 8;

	// Favor the current side when it only needs a small nudge, and only flip when
	// staying there would overlap too aggressively.
	if (rightOverlap === 0) {
		left = rightIdealLeft;
	} else if (rightOverlap <= softOverlapLimit) {
		left = rightAdjustedLeft;
	} else if (leftOverlap === 0) {
		left = leftIdealLeft;
	} else if (leftOverlap <= softOverlapLimit) {
		left = leftAdjustedLeft;
	} else {
		left = leftOverlap < rightOverlap ? leftAdjustedLeft : rightAdjustedLeft;
	}
	if (rootRect.top + top + menuRect.height >= bottomBoundary) {
		top -= (rootRect.top + top + menuRect.height) - bottomBoundary;
	}
	if (rootRect.top + top < viewportMargin) {
		top += viewportMargin - (rootRect.top + top);
	}

	return { left, top };
}
