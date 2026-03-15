import { onBeforeUnmount, ref } from 'vue';
import type { CSSProperties, Ref } from 'vue';

type SortableItem = {
	id: string;
};

export function useLongPressGridSort<T extends SortableItem>(options: {
	rootEl: Ref<HTMLElement | null>;
	getItems: () => T[];
	onReorder: (items: T[]) => void;
	longPressDelayMs?: number;
	moveTolerancePx?: number;
}) {
	const longPressDelayMs = options.longPressDelayMs ?? 280;
	const moveTolerancePx = options.moveTolerancePx ?? 10;

	const touchDraggingItemId = ref<string | null>(null);
	const touchDropTargetItemId = ref<string | null>(null);
	const touchDragOffsetX = ref(0);
	const touchDragOffsetY = ref(0);

	let activeTouchId: number | null = null;
	let pressTimer: number | null = null;
	let pendingItemId: string | null = null;
	let startX = 0;
	let startY = 0;
	let suppressActivationUntil = 0;
	let previousBodyUserSelect = '';

	function clearPressTimer() {
		if (pressTimer != null) {
			window.clearTimeout(pressTimer);
			pressTimer = null;
		}
	}

	function removeWindowListeners() {
		window.removeEventListener('touchmove', onWindowTouchMove);
		window.removeEventListener('touchend', onWindowTouchEnd);
		window.removeEventListener('touchcancel', onWindowTouchCancel);
	}

	function addWindowListeners() {
		removeWindowListeners();
		window.addEventListener('touchmove', onWindowTouchMove, { passive: false });
		window.addEventListener('touchend', onWindowTouchEnd, { passive: false });
		window.addEventListener('touchcancel', onWindowTouchCancel, { passive: false });
	}

	function resetTouchState() {
		clearPressTimer();
		removeWindowListeners();
		activeTouchId = null;
		pendingItemId = null;
		touchDraggingItemId.value = null;
		touchDropTargetItemId.value = null;
		touchDragOffsetX.value = 0;
		touchDragOffsetY.value = 0;
		document.body.style.userSelect = previousBodyUserSelect;
	}

	function startTouchDrag(itemId: string) {
		clearPressTimer();
		pendingItemId = null;
		touchDraggingItemId.value = itemId;
		touchDropTargetItemId.value = null;
		touchDragOffsetX.value = 0;
		touchDragOffsetY.value = 0;
		previousBodyUserSelect = document.body.style.userSelect;
		document.body.style.userSelect = 'none';
	}

	function moveItem(items: T[], sourceId: string, targetId: string): T[] {
		const fromIndex = items.findIndex(item => item.id === sourceId);
		const toIndex = items.findIndex(item => item.id === targetId);

		if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
			return items;
		}

		const nextItems = [...items];
		const [draggedItem] = nextItems.splice(fromIndex, 1);
		nextItems.splice(toIndex, 0, draggedItem);
		return nextItems;
	}

	function getTrackedTouch(ev: TouchEvent): Touch | null {
		if (activeTouchId == null) return null;

		for (const touch of Array.from(ev.touches)) {
			if (touch.identifier === activeTouchId) return touch;
		}

		for (const touch of Array.from(ev.changedTouches)) {
			if (touch.identifier === activeTouchId) return touch;
		}

		return null;
	}

	function findDropTargetItemId(clientX: number, clientY: number): string | null {
		const rootEl = options.rootEl.value;
		if (rootEl == null) return null;

		const rootRect = rootEl.getBoundingClientRect();
		if (
			clientX < rootRect.left - 24 ||
			clientX > rootRect.right + 24 ||
			clientY < rootRect.top - 24 ||
			clientY > rootRect.bottom + 24
		) {
			return null;
		}

		for (const element of document.elementsFromPoint(clientX, clientY)) {
			if (!(element instanceof HTMLElement) || !rootEl.contains(element)) continue;

			const targetEl = element.closest<HTMLElement>('[data-grid-sort-id]');
			const targetId = targetEl?.dataset.gridSortId ?? null;

			if (targetId != null && targetId !== touchDraggingItemId.value) {
				return targetId;
			}
		}

		let nearestId: string | null = null;
		let nearestDistance = Number.POSITIVE_INFINITY;

		for (const tileEl of Array.from(rootEl.querySelectorAll<HTMLElement>('[data-grid-sort-id]'))) {
			const targetId = tileEl.dataset.gridSortId ?? null;
			if (targetId == null || targetId === touchDraggingItemId.value) continue;

			const rect = tileEl.getBoundingClientRect();
			const centerX = rect.left + rect.width / 2;
			const centerY = rect.top + rect.height / 2;
			const distance = (centerX - clientX) ** 2 + (centerY - clientY) ** 2;

			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearestId = targetId;
			}
		}

		return nearestId;
	}

	function finishTouchDrag(applyDrop: boolean) {
		const draggedItemId = touchDraggingItemId.value;
		const dropTargetItemId = touchDropTargetItemId.value;

		if (applyDrop && draggedItemId != null && dropTargetItemId != null && draggedItemId !== dropTargetItemId) {
			const currentItems = options.getItems();
			const nextItems = moveItem(currentItems, draggedItemId, dropTargetItemId);
			if (nextItems !== currentItems) {
				options.onReorder(nextItems);
			}
		}

		if (draggedItemId != null) {
			suppressActivationUntil = Date.now() + 350;
		}

		resetTouchState();
	}

	function onWindowTouchMove(ev: TouchEvent) {
		const touch = getTrackedTouch(ev);
		if (touch == null) return;

		const offsetX = touch.clientX - startX;
		const offsetY = touch.clientY - startY;

		if (touchDraggingItemId.value == null) {
			if (Math.hypot(offsetX, offsetY) > moveTolerancePx) {
				clearPressTimer();
			}
			return;
		}

		ev.preventDefault();

		touchDragOffsetX.value = offsetX;
		touchDragOffsetY.value = offsetY;
		touchDropTargetItemId.value = findDropTargetItemId(touch.clientX, touch.clientY);
	}

	function onWindowTouchEnd(ev: TouchEvent) {
		if (getTrackedTouch(ev) == null) return;
		finishTouchDrag(true);
	}

	function onWindowTouchCancel(ev: TouchEvent) {
		if (getTrackedTouch(ev) == null) return;
		finishTouchDrag(false);
	}

	function onItemTouchStart(item: T, ev: TouchEvent) {
		if (ev.touches.length !== 1 || touchDraggingItemId.value != null) return;

		const touch = ev.changedTouches[0];
		if (touch == null) return;

		activeTouchId = touch.identifier;
		pendingItemId = item.id;
		startX = touch.clientX;
		startY = touch.clientY;

		addWindowListeners();
		clearPressTimer();
		pressTimer = window.setTimeout(() => {
			if (pendingItemId !== item.id) return;
			startTouchDrag(item.id);
		}, longPressDelayMs);
	}

	function shouldSuppressActivation(): boolean {
		return Date.now() < suppressActivationUntil;
	}

	function getTouchDragStyle(itemId: string): CSSProperties | undefined {
		if (touchDraggingItemId.value !== itemId) return undefined;

		return {
			'--grid-drag-x': `${touchDragOffsetX.value}px`,
			'--grid-drag-y': `${touchDragOffsetY.value}px`,
		};
	}

	onBeforeUnmount(() => {
		finishTouchDrag(false);
	});

	return {
		touchDraggingItemId,
		touchDropTargetItemId,
		onItemTouchStart,
		shouldSuppressActivation,
		getTouchDragStyle,
	};
}
