<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="[$style.root, { [$style.asDrawer]: asDrawer, [$style.asWindow]: asWindow }]"
	:style="rootStyle"
	@keydown.capture="onPickerKeydown"
>
	<div :class="$style.searchBar">
		<i class="ti ti-search" :class="$style.searchIcon" aria-hidden="true"></i>
		<input
			ref="searchEl"
			v-model="searchQuery"
			:class="$style.searchInput"
			data-prevent-emoji-insert
			type="search"
			:placeholder="i18n.ts._emojiPicker.searchPlaceholder"
			:aria-label="i18n.ts._emojiPicker.searchPlaceholder"
			autocapitalize="off"
			autocomplete="off"
			spellcheck="false"
			@keydown="onSearchKeydown"
		>
		<button
			v-if="searchQuery !== ''"
			class="_button"
			:class="$style.clearSearch"
			:title="i18n.ts.clear"
			:aria-label="i18n.ts.clear"
			@click="clearSearch"
		>
			<i class="ti ti-x" aria-hidden="true"></i>
		</button>
	</div>

	<div :id="panelId" :class="$style.content" role="tabpanel">
		<template v-if="normalizedSearchQuery !== ''">
			<div :class="$style.sectionHeader">
				<div :class="$style.sectionTitle">{{ i18n.ts.searchResult }}</div>
				<div :class="$style.resultCount" aria-live="polite">
					{{ i18n.tsx._emojiPicker.searchResultCount({ count: searchResults.length }) }}
				</div>
			</div>
			<MkEmojiPickerGrid
				v-if="searchResults.length > 0"
				ref="grid"
				:class="$style.grid"
				:items="searchResults"
				:disabledItems="searchDisabledEmojis"
				:columns="columns"
				:itemSize="cellSize"
				:responsive="asDrawer || asWindow"
				:animated="prefer.s.animation"
				:ariaLabel="i18n.ts.searchResult"
				@chosen="chosen"
			/>
			<div v-else :class="$style.emptyState">
				<i class="ti ti-search-off" aria-hidden="true"></i>
				<span>{{ i18n.ts._emojiPicker.noSearchResults }}</span>
			</div>
		</template>

		<template v-else-if="activeSectionKey === HOME_SECTION_KEY">
			<div ref="homeScrollEl" :class="$style.home">
				<section :class="$style.homeSection">
					<h2 :class="[$style.sectionTitle, $style.homeSectionTitle]">{{ i18n.ts.recentUsed }}</h2>
					<MkEmojiPickerGrid
						v-if="recentlyUsedEmojisDisplay.length > 0"
						ref="recentGrid"
						:items="recentlyUsedEmojisDisplay"
						:disabledItems="recentDisabledEmojis"
						:columns="columns"
						:itemSize="cellSize"
						:virtualized="false"
						:responsive="asDrawer || asWindow"
						:animated="prefer.s.animation"
						:ariaLabel="i18n.ts.recentUsed"
						@chosen="chosen"
					/>
					<div v-else :class="$style.emptyState">
						<i class="ti ti-mood-smile" aria-hidden="true"></i>
						<span>{{ i18n.ts._emojiPicker.noFrequentlyUsedEmojis }}</span>
					</div>
				</section>
			</div>
		</template>

		<template v-else>
			<div :class="$style.sectionHeader">
				<h2 :class="$style.sectionTitle">{{ activeSection?.title ?? i18n.ts.emoji }}</h2>
			</div>
			<MkEmojiPickerGrid
				v-if="activeSection && activeSection.emojis.length > 0"
				ref="grid"
				:class="$style.grid"
				:items="activeSection.emojis"
				:disabledItems="activeSectionDisabledEmojis"
				:columns="columns"
				:itemSize="cellSize"
				:responsive="asDrawer || asWindow"
				:animated="prefer.s.animation"
				:ariaLabel="activeSection.title"
				@chosen="chosen"
			/>
			<div v-else :class="$style.emptyState">
				<i class="ti ti-mood-empty" aria-hidden="true"></i>
				<span>{{ i18n.ts.noCustomEmojis }}</span>
			</div>
		</template>
	</div>

	<nav :class="$style.bottomBar" :aria-label="i18n.ts._emojiPicker.categoryNavigation">
		<button
			v-if="showPrevArrow"
			class="_button"
			:class="$style.navArrow"
			:title="i18n.ts._emojiPicker.previousCategories"
			:aria-label="i18n.ts._emojiPicker.previousCategories"
			@click="scrollRail('prev')"
		>
			<i class="ti ti-chevron-left" aria-hidden="true"></i>
		</button>
		<div
			ref="bottomBarTrack"
			:class="$style.bottomBarTrack"
			role="tablist"
			@scroll.passive="updateRailButtons"
		>
			<button
				v-for="(section, index) in navigationSections"
				:key="section.key"
				class="_button"
				:class="[$style.bottomTab, { [$style.active]: section.key === activeSectionKey }]"
				role="tab"
				:aria-selected="section.key === activeSectionKey"
				:aria-controls="panelId"
				:tabindex="section.key === activeSectionKey ? 0 : -1"
				:title="section.title"
				:aria-label="section.title"
				:data-section-key="section.key"
				@click="selectSection(section.key)"
				@keydown="onNavigationKeydown($event, index)"
			>
				<i v-if="section.iconClass" :class="section.iconClass" aria-hidden="true"></i>
				<MkCustomEmoji
					v-else-if="section.icon?.startsWith(':')"
					:name="section.icon"
					:normal="true"
					:fallbackToImage="true"
					loading="lazy"
				/>
				<MkEmoji v-else-if="section.icon" :emoji="section.icon" :normal="true" loading="lazy"/>
				<span v-else :class="$style.categoryFallback">{{ section.title.slice(0, 1).toUpperCase() }}</span>
			</button>
		</div>
		<button
			v-if="showNextArrow"
			class="_button"
			:class="$style.navArrow"
			:title="i18n.ts.next"
			:aria-label="i18n.ts.next"
			@click="scrollRail('next')"
		>
			<i class="ti ti-chevron-right" aria-hidden="true"></i>
		</button>
	</nav>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import {
	emojilist,
	emojiCharByCategory,
	unicodeEmojiCategories,
} from '@@/js/emojilist.js';
import type { EmojiPickerSearchEntry } from '@/utility/emoji-picker-data.js';
import MkEmojiPickerGrid from '@/components/MkEmojiPickerGrid.vue';
import MkRippleEffect from '@/components/MkRippleEffect.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { store } from '@/store.js';
import { customEmojis, customEmojisMap } from '@/custom-emojis.js';
import { $i } from '@/i.js';
import { checkReactionPermissions } from '@/utility/check-reaction-permissions.js';
import { prefer } from '@/preferences.js';
import { haptic } from '@/utility/haptic.js';
import { RECENTLY_USED_EMOJIS_VISIBLE_ROWS, updateRecentlyUsedEmojis } from '@/utility/recently-used-emojis.js';
import {
	buildCustomEmojiCategoryIndex,
	searchEmojiPickerEntries,
} from '@/utility/emoji-picker-data.js';
import { deviceKind } from '@/utility/device-kind.js';
import { isTouchUsing } from '@/utility/touch.js';

type PickerSection = {
	key: string;
	title: string;
	emojis: string[];
	icon: string | null;
	iconClass: string | null;
};

const HOME_SECTION_KEY = '__home__';
const OTHER_CUSTOM_CATEGORY_KEY = '__other__';

const props = withDefaults(defineProps<{
	showPinned?: boolean;
	pinnedEmojis?: string[];
	maxHeight?: number;
	asDrawer?: boolean;
	asWindow?: boolean;
	asReactionPicker?: boolean;
	targetNote?: Misskey.entities.Note | null;
}>(), {
	showPinned: true,
	pinnedEmojis: undefined,
	maxHeight: undefined,
	asDrawer: false,
	asWindow: false,
	asReactionPicker: false,
	targetNote: null,
});

const emit = defineEmits<{
	(ev: 'chosen', value: string): void;
	(ev: 'esc'): void;
}>();

const searchEl = useTemplateRef('searchEl');
const grid = useTemplateRef('grid');
const recentGrid = useTemplateRef('recentGrid');
const homeScrollEl = useTemplateRef('homeScrollEl');
const bottomBarTrack = useTemplateRef('bottomBarTrack');
const panelId = `emoji-picker-panel-${useId()}`;
const searchQuery = ref('');
const activeSectionKey = ref(HOME_SECTION_KEY);
const showPrevArrow = ref(false);
const showNextArrow = ref(false);
let railResizeObserver: ResizeObserver | null = null;

const {
	emojiPickerScale,
	emojiPickerWidth,
	emojiPickerHeight,
} = prefer.r;
const recentlyUsedEmojis = store.r.recentlyUsedEmojis;

const size = computed(() => emojiPickerScale.value);
const width = computed(() => emojiPickerWidth.value);
const height = computed(() => emojiPickerHeight.value);
const cellSize = computed(() => [40, 45, 50, 55, 60][Math.min(Math.max(size.value - 1, 0), 4)] ?? 45);
const columns = computed(() => width.value + 4);
const rows = computed(() => [4, 6, 8, 10][Math.min(Math.max(height.value - 1, 0), 3)] ?? 6);
const homeDisplayLimit = computed(() => columns.value * RECENTLY_USED_EMOJIS_VISIBLE_ROWS);
const normalizedSearchQuery = computed(() => searchQuery.value.trim());
const recentlyUsedEmojisDisplay = computed(() => recentlyUsedEmojis.value.slice(0, homeDisplayLimit.value));

const categoryIndex = computed(() => buildCustomEmojiCategoryIndex(customEmojis.value));
const customSections = computed<PickerSection[]>(() => {
	return Array.from(categoryIndex.value.entries()).map(([category, emojis]) => ({
		key: category === '' ? OTHER_CUSTOM_CATEGORY_KEY : `custom:${category}`,
		title: category === '' ? i18n.ts.other : category,
		emojis: emojis.map(emoji => `:${emoji.name}:`),
		icon: emojis[0] ? `:${emojis[0].name}:` : null,
		iconClass: null,
	}));
});
const unicodeCategoryTitles = computed<Record<typeof unicodeEmojiCategories[number], string>>(() => ({
	face: i18n.ts._emojiPicker.categories.face,
	people: i18n.ts._emojiPicker.categories.people,
	animals_and_nature: i18n.ts._emojiPicker.categories.animalsAndNature,
	food_and_drink: i18n.ts._emojiPicker.categories.foodAndDrink,
	activity: i18n.ts._emojiPicker.categories.activity,
	travel_and_places: i18n.ts._emojiPicker.categories.travelAndPlaces,
	objects: i18n.ts._emojiPicker.categories.objects,
	symbols: i18n.ts._emojiPicker.categories.symbols,
	flags: i18n.ts._emojiPicker.categories.flags,
}));
const unicodeSections = computed<PickerSection[]>(() => unicodeEmojiCategories.map(category => {
	const emojis = emojiCharByCategory.get(category) ?? [];
	return {
		key: `unicode:${category}`,
		title: unicodeCategoryTitles.value[category],
		emojis,
		icon: emojis[0] ?? null,
		iconClass: null,
	};
}));
const homeSection = computed<PickerSection>(() => ({
	key: HOME_SECTION_KEY,
	title: i18n.ts.recentUsed,
	emojis: [],
	icon: null,
	iconClass: 'ti ti-clock',
}));
const navigationSections = computed<PickerSection[]>(() => [
	homeSection.value,
	...customSections.value,
	...unicodeSections.value,
]);
const activeSection = computed(() => navigationSections.value.find(section => section.key === activeSectionKey.value) ?? homeSection.value);
const activeSectionDisabledEmojis = computed(() => activeSection.value.emojis.filter(emoji => !canReact(emoji)));
const recentDisabledEmojis = computed(() => recentlyUsedEmojisDisplay.value.filter(emoji => !canReact(emoji)));

const searchEntries = computed<EmojiPickerSearchEntry[]>(() => {
	const customEntries: EmojiPickerSearchEntry[] = customEmojis.value.map(emoji => ({
		key: `:${emoji.name}:`,
		name: emoji.name,
		aliases: emoji.aliases,
		keywords: [],
	}));
	const unicodeEntries: EmojiPickerSearchEntry[] = emojilist.map(emoji => ({
		key: emoji.char,
		name: emoji.name,
		aliases: [],
		keywords: Object.values(store.s.additionalUnicodeEmojiIndexes).flatMap(index => index[emoji.char] ?? []),
	}));
	return [...customEntries, ...unicodeEntries];
});
const searchResults = computed(() => searchEmojiPickerEntries(searchEntries.value, normalizedSearchQuery.value).map(entry => entry.key));
const searchDisabledEmojis = computed(() => searchResults.value.filter(emoji => !canReact(emoji)));
const rootStyle = computed(() => ({
	width: props.asDrawer || props.asWindow ? undefined : `${cellSize.value * columns.value + 16}px`,
	height: props.asWindow ? undefined : `${cellSize.value * rows.value + 16}px`,
	maxHeight: props.maxHeight ? `${props.maxHeight}px` : undefined,
	'--emojiPickerCellSize': `${cellSize.value}px`,
}));

watch(navigationSections, sections => {
	if (!sections.some(section => section.key === activeSectionKey.value)) {
		activeSectionKey.value = HOME_SECTION_KEY;
	}
	nextTick(updateRailButtons);
});

watch(activeSectionKey, () => {
	nextTick(() => {
		grid.value?.reset();
		scrollActiveSectionIntoView();
		updateRailButtons();
	});
});

watch(normalizedSearchQuery, () => {
	nextTick(() => grid.value?.reset());
});

function canReact(emoji: string): boolean {
	if (!props.targetNote) return true;
	if ($i == null) return false;
	if (emoji.startsWith(':') && emoji.endsWith(':')) {
		const definition = customEmojisMap.get(emoji.slice(1, -1).replace('@.', ''));
		if (definition) return checkReactionPermissions($i, props.targetNote, definition);
	}
	return checkReactionPermissions($i, props.targetNote, emoji);
}

function selectSection(key: string) {
	activeSectionKey.value = key;
	searchQuery.value = '';
	if (homeScrollEl.value) homeScrollEl.value.scrollTop = 0;
}

function clearSearch() {
	searchQuery.value = '';
	nextTick(() => searchEl.value?.focus());
}

function onSearchKeydown(event: KeyboardEvent) {
	if (event.isComposing || event.key === 'Process' || event.keyCode === 229) return;

	if (event.key === 'Enter' && searchResults.value[0]) {
		event.preventDefault();
		chosen(searchResults.value[0]);
	} else if (event.key === 'ArrowDown' && searchResults.value.length > 0) {
		event.preventDefault();
		grid.value?.focus();
	}
}

function onPickerKeydown(event: KeyboardEvent) {
	if (event.isComposing || event.key === 'Process' || event.keyCode === 229 || event.key !== 'Escape') return;

	event.preventDefault();
	event.stopPropagation();
	if (searchQuery.value !== '') {
		clearSearch();
	} else {
		emit('esc');
	}
}

function updateRailButtons() {
	const rail = bottomBarTrack.value;
	if (rail == null) {
		showPrevArrow.value = false;
		showNextArrow.value = false;
		return;
	}
	showPrevArrow.value = rail.scrollLeft > 4;
	showNextArrow.value = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4;
}

function scrollRail(direction: 'prev' | 'next') {
	const rail = bottomBarTrack.value;
	if (rail == null) return;
	rail.scrollBy({
		left: direction === 'next' ? Math.max(rail.clientWidth * 0.75, 120) : -Math.max(rail.clientWidth * 0.75, 120),
		behavior: prefer.s.animation ? 'smooth' : 'auto',
	});
}

function scrollActiveSectionIntoView() {
	const rail = bottomBarTrack.value;
	if (rail == null) return;
	const button = Array.from(rail.querySelectorAll<HTMLElement>('[data-section-key]'))
		.find(element => element.dataset.sectionKey === activeSectionKey.value);
	button?.scrollIntoView({
		behavior: prefer.s.animation ? 'smooth' : 'auto',
		block: 'nearest',
		inline: 'center',
	});
}

function onNavigationKeydown(event: KeyboardEvent, index: number) {
	if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
	event.preventDefault();

	const lastIndex = navigationSections.value.length - 1;
	const nextIndex = event.key === 'Home'
		? 0
		: event.key === 'End'
			? lastIndex
			: Math.min(Math.max(index + (event.key === 'ArrowRight' ? 1 : -1), 0), lastIndex);
	const section = navigationSections.value[nextIndex];
	selectSection(section.key);
	nextTick(() => {
		bottomBarTrack.value?.querySelector<HTMLElement>(`[data-section-key="${CSS.escape(section.key)}"]`)?.focus();
	});
}

function chosen(emoji: string, event?: PointerEvent) {
	const element = event?.currentTarget as HTMLElement | null | undefined;
	if (element && prefer.s.animation) {
		const rect = element.getBoundingClientRect();
		const { dispose } = os.popup(MkRippleEffect, {
			x: rect.left + element.offsetWidth / 2,
			y: rect.top + element.offsetHeight / 2,
		}, {
			end: () => dispose(),
		});
	}

	emit('chosen', emoji);
	haptic();

	store.set('recentlyUsedEmojis', updateRecentlyUsedEmojis(store.s.recentlyUsedEmojis, emoji));
}

function focus() {
	if (!['smartphone', 'tablet'].includes(deviceKind) && !isTouchUsing) {
		searchEl.value?.focus({ preventScroll: true });
	}
}

function reset() {
	searchQuery.value = '';
	activeSectionKey.value = HOME_SECTION_KEY;
	if (homeScrollEl.value) homeScrollEl.value.scrollTop = 0;
	grid.value?.reset();
	recentGrid.value?.reset();
}

onMounted(() => {
	updateRailButtons();
	if (typeof ResizeObserver !== 'undefined') {
		railResizeObserver = new ResizeObserver(updateRailButtons);
		const rail = bottomBarTrack.value;
		if (rail) railResizeObserver.observe(rail);
	}
});

onBeforeUnmount(() => {
	railResizeObserver?.disconnect();
});

defineExpose({
	focus,
	reset,
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	min-height: 180px;
	overflow: hidden;
}

.asDrawer,
.asWindow {
	width: 100% !important;
}

.asWindow {
	height: 100% !important;
}

.searchBar {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 8px 8px 0;
	padding: 0 10px;
	min-height: 38px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panelHighlight);

	&:focus-within {
		border-color: var(--MI_THEME-focus);
		box-shadow: 0 0 0 1px var(--MI_THEME-focus);
	}
}

.searchIcon {
	flex: 0 0 auto;
	color: var(--MI_THEME-fgTransparentStrong);
}

.searchInput {
	flex: 1 1 auto;
	min-width: 0;
	padding: 8px 0;
	border: 0;
	outline: 0;
	background: transparent;
	color: var(--MI_THEME-fg);
	font: inherit;

	&::placeholder {
		color: var(--MI_THEME-fgTransparentWeak);
	}

	&::-webkit-search-cancel-button {
		display: none;
	}
}

.clearSearch {
	flex: 0 0 auto;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	border-radius: 50%;
	color: var(--MI_THEME-fgTransparentStrong);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-fg);
	}
}

.content {
	flex: 1 1 auto;
	display: flex;
	flex-direction: column;
	min-height: 0;
}

.grid {
	flex: 1 1 auto;
	min-height: 0;
}

.home {
	flex: 1 1 auto;
	min-height: 0;
	overflow-y: auto;
	scrollbar-width: none;
}

.homeSection {
	padding-top: 10px;
}

.sectionHeader {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	min-height: 34px;
	padding: 8px 12px 0;
}

.sectionTitle {
	margin: 0;
	font-size: 13px;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentStrong);
}

.homeSectionTitle {
	padding: 8px 12px 0;
}

.resultCount {
	margin-left: auto;
	font-size: 11px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.emptyState {
	flex: 1 1 auto;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-height: 100px;
	padding: 24px 16px;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);

	> i {
		font-size: 24px;
	}
}

.bottomBar {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 6px 8px;
	border-top: solid 0.5px var(--MI_THEME-divider);
}

.bottomBarTrack {
	flex: 1 1 auto;
	display: flex;
	gap: 6px;
	min-width: 0;
	overflow-x: auto;
	overflow-y: hidden;
	scrollbar-width: none;
	scroll-snap-type: x proximity;
}

.navArrow,
.bottomTab {
	flex: 0 0 auto;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: calc(var(--emojiPickerCellSize) - 8px);
	height: calc(var(--emojiPickerCellSize) - 8px);
	min-width: 32px;
	min-height: 32px;
	padding: 0;
	border: 1px solid transparent;
	border-radius: 10px;
	color: var(--MI_THEME-fg);
	scroll-snap-align: center;

	&:hover {
		background: var(--MI_THEME-panelHighlight);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.bottomTab {
	&.active {
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 40%, transparent);
		background: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
	}

	> img,
	> span:not(.categoryFallback) {
		width: 100%;
		height: 1.25em;
		object-fit: contain;
		pointer-events: none;
	}
}

.categoryFallback {
	font-size: 13px;
	font-weight: 700;
	letter-spacing: 0.04em;
	color: currentColor;
}
</style>
