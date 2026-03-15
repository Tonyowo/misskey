<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="omfetrab" :class="['s' + size, 'w' + width, 'h' + height, { asDrawer, asWindow }]" :style="{ maxHeight: maxHeight ? maxHeight + 'px' : undefined }">
	<div v-if="searchOpen || q !== ''" class="searchBar">
		<input
			ref="searchEl"
			:value="q"
			class="search"
			data-prevent-emoji-insert
			:placeholder="i18n.ts.search"
			type="search"
			autocapitalize="off"
			@input="input()"
			@paste.stop="paste"
			@keydown="onKeydown"
		>
		<button class="_button searchClose" :title="i18n.ts.close" :aria-label="i18n.ts.close" @click="closeSearch">
			<i class="ti ti-x"></i>
		</button>
	</div>

	<!-- FirefoxのTabフォーカスが想定外の挙動となるためtabindex="-1"を追加 https://github.com/misskey-dev/misskey/issues/10744 -->
	<div ref="emojisEl" class="emojis" tabindex="-1">
		<section v-if="q !== ''" class="resultSection">
			<header class="sectionTitle">{{ i18n.ts.searchResult }}</header>
			<div v-if="searchResultCustom.length > 0" class="body">
				<button
					v-for="emoji in searchResultCustom"
					:key="emoji.name"
					class="_button item"
					:disabled="!canReact(emoji)"
					:title="emoji.name"
					tabindex="0"
					@click="chosen(emoji, $event)"
				>
					<MkCustomEmoji class="emoji" :name="emoji.name" :fallbackToImage="true"/>
				</button>
			</div>
			<div v-if="searchResultUnicode.length > 0" class="body">
				<button
					v-for="emoji in searchResultUnicode"
					:key="emoji.name"
					class="_button item"
					:title="emoji.name"
					tabindex="0"
					@click="chosen(emoji, $event)"
				>
					<MkEmoji class="emoji" :emoji="emoji.char"/>
				</button>
			</div>
			<div v-if="searchResultCustom.length === 0 && searchResultUnicode.length === 0" class="emptyState">{{ i18n.ts.search }}</div>
		</section>

		<template v-else>
			<section v-if="recentlyUsedEmojisDef.length > 0" class="contentSection">
				<header class="sectionTitle">{{ i18n.ts.recentUsed }}</header>
				<div class="body compact">
					<button
						v-for="emoji in recentlyUsedEmojisDef"
						:key="getKey(emoji)"
						class="_button item"
						:disabled="!canReact(emoji)"
						:data-emoji="getKey(emoji)"
						@pointerenter="computeButtonTitle"
						@click="chosen(emoji, $event)"
					>
						<MkCustomEmoji v-if="!emoji.hasOwnProperty('char')" class="emoji" :name="getKey(emoji)" :normal="true" :fallbackToImage="true"/>
						<MkEmoji v-else class="emoji" :emoji="getKey(emoji)" :normal="true"/>
					</button>
				</div>
			</section>

			<section class="contentSection">
				<header class="sectionTitle">{{ activeSection?.title ?? i18n.ts.emoji }}</header>
				<div v-if="activeSection" class="body">
					<button
						v-for="emoji in activeSection.emojis"
						:key="emoji"
						:data-emoji="emoji"
						class="_button item"
						:disabled="activeSection.disabledEmojis.includes(emoji)"
						@pointerenter="computeButtonTitle"
						@click="chosen(emoji, $event)"
					>
						<MkCustomEmoji v-if="emoji.startsWith(':')" class="emoji" :name="emoji" :normal="true" :fallbackToImage="true"/>
						<MkEmoji v-else class="emoji" :emoji="emoji" :normal="true"/>
					</button>
				</div>
				<div v-else class="emptyState">{{ i18n.ts.noCustomEmojis }}</div>
			</section>
		</template>
	</div>

	<div class="bottomBar">
		<button
			v-for="item in bottomTabs"
			:key="item.key"
			class="_button bottomTab"
			:class="{ active: item.active }"
			:title="item.title"
			:aria-label="item.title"
			:disabled="item.disabled"
			@click="activateBottomTab(item)"
		>
			<i v-if="item.iconClass" :class="item.iconClass"></i>
			<MkCustomEmoji v-else-if="item.icon?.startsWith(':')" class="emoji" :name="item.icon" :normal="true" :fallbackToImage="true"/>
			<MkEmoji v-else-if="item.icon" class="emoji" :emoji="item.icon" :normal="true"/>
			<span v-else class="categoryFallback">{{ item.title.slice(0, 1).toUpperCase() }}</span>
		</button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, watch, onMounted, nextTick } from 'vue';
import * as Misskey from 'misskey-js';
import {
	emojilist,
	emojiCharByCategory,
	unicodeEmojiCategories as categories,
	getEmojiName,
	getUnicodeEmoji,
} from '@@/js/emojilist.js';
import type { UnicodeEmojiDef } from '@@/js/emojilist.js';
import MkRippleEffect from '@/components/MkRippleEffect.vue';
import * as os from '@/os.js';
import { isTouchUsing } from '@/utility/touch.js';
import { deviceKind } from '@/utility/device-kind.js';
import { i18n } from '@/i18n.js';
import { store } from '@/store.js';
import { customEmojiCategories, customEmojis, customEmojisMap } from '@/custom-emojis.js';
import { $i } from '@/i.js';
import { checkReactionPermissions } from '@/utility/check-reaction-permissions.js';
import { prefer } from '@/preferences.js';
import { haptic } from '@/utility/haptic.js';

type PickerSection = {
	key: string;
	label: string;
	title: string;
	emojis: string[];
	disabledEmojis: string[];
	icon: string | null;
};

type BottomTabItem = {
	key: string;
	title: string;
	icon: string | null;
	iconClass: string | null;
	active: boolean;
	disabled: boolean;
	kind: 'search' | 'custom-all' | 'custom-section' | 'pinned' | 'unicode-switch' | 'unicode-section';
};

const OTHER_CUSTOM_CATEGORY_KEY = '__other__';
const ALL_CUSTOM_SECTION_KEY = '__all_custom__';

const props = withDefaults(defineProps<{
	showPinned?: boolean;
	pinnedEmojis?: string[];
	maxHeight?: number;
	asDrawer?: boolean;
	asWindow?: boolean;
	asReactionPicker?: boolean; // 今は使われてないが将来的に使いそう
	targetNote?: Misskey.entities.Note | null;
}>(), {
	showPinned: true,
});

const emit = defineEmits<{
	(ev: 'chosen', v: string): void;
	(ev: 'esc'): void;
}>();

const searchEl = useTemplateRef('searchEl');
const emojisEl = useTemplateRef('emojisEl');

const {
	emojiPickerScale,
	emojiPickerWidth,
	emojiPickerHeight,
} = prefer.r;

const recentlyUsedEmojis = store.r.recentlyUsedEmojis;

const recentlyUsedEmojisDef = computed(() => {
	return recentlyUsedEmojis.value.map(getDef);
});
const pinned = computed(() => props.pinnedEmojis ?? []);
const pinnedEmojisDef = computed(() => {
	return pinned.value.map(getDef);
});

const size = computed(() => emojiPickerScale.value);
const width = computed(() => emojiPickerWidth.value);
const height = computed(() => emojiPickerHeight.value);
const q = ref<string>('');
const searchOpen = ref(false);
const searchResultCustom = ref<Misskey.entities.EmojiSimple[]>([]);
const searchResultUnicode = ref<UnicodeEmojiDef[]>([]);
const browser = ref<'custom' | 'unicode' | 'pinned'>(customEmojis.value.length > 0 ? 'custom' : 'unicode');
const activeCustomSectionKey = ref<string>(ALL_CUSTOM_SECTION_KEY);
const activeUnicodeSectionKey = ref<string | null>(categories[0] ?? null);

const allCustomSection = computed<PickerSection | null>(() => {
	if (customEmojis.value.length === 0) return null;

	return {
		key: ALL_CUSTOM_SECTION_KEY,
		label: i18n.ts.all,
		title: `${i18n.ts.all}${i18n.ts.customEmojis}`,
		emojis: customEmojis.value.map(emoji => `:${emoji.name}:`),
		disabledEmojis: customEmojis.value.filter(emoji => !canReact(emoji)).map(emoji => `:${emoji.name}:`),
		icon: '🙂',
	};
});

const pinnedSection = computed<PickerSection | null>(() => {
	if (!props.showPinned || pinnedEmojisDef.value.length === 0) return null;

	return {
		key: '__pinned__',
		label: i18n.ts.pinned,
		title: i18n.ts.pinned,
		emojis: pinnedEmojisDef.value.map(getKey),
		disabledEmojis: pinnedEmojisDef.value.filter(emoji => !canReact(emoji)).map(getKey),
		icon: null,
	};
});

const customSections = computed<PickerSection[]>(() => {
	return customEmojiCategories.value
		.map(category => category ?? '')
		.map(category => {
			const emojis = customEmojis.value.filter(emoji => filterCategory(emoji, category));
			if (emojis.length === 0) return null;

			return {
				key: getCustomCategoryKey(category),
				label: getCustomCategoryLabel(category),
				title: getCustomCategoryLabel(category),
				emojis: emojis.map(emoji => `:${emoji.name}:`),
				disabledEmojis: emojis.filter(emoji => !canReact(emoji)).map(emoji => `:${emoji.name}:`),
				icon: emojis[0] ? `:${emojis[0].name}:` : null,
			} satisfies PickerSection;
		})
		.filter((section): section is PickerSection => section != null);
});

const unicodeSections = computed<PickerSection[]>(() => {
	return categories.map(category => {
		const emojis = emojiCharByCategory.get(category) ?? [];
		return {
			key: category,
			label: humanizeUnicodeCategory(category),
			title: humanizeUnicodeCategory(category),
			emojis,
			disabledEmojis: [],
			icon: emojis[0] ?? null,
		} satisfies PickerSection;
	});
});

const activeCustomSection = computed(() => {
	if (activeCustomSectionKey.value === ALL_CUSTOM_SECTION_KEY) {
		return allCustomSection.value;
	}
	return customSections.value.find(section => section.key === activeCustomSectionKey.value) ?? allCustomSection.value;
});

const activeUnicodeSection = computed(() => {
	return unicodeSections.value.find(section => section.key === activeUnicodeSectionKey.value) ?? unicodeSections.value[0] ?? null;
});

const activeSection = computed(() => {
	if (browser.value === 'pinned') return pinnedSection.value;
	if (browser.value === 'unicode') return activeUnicodeSection.value;
	return activeCustomSection.value ?? activeUnicodeSection.value;
});

const bottomTabs = computed<BottomTabItem[]>(() => {
	const items: BottomTabItem[] = [{
		key: 'search',
		title: i18n.ts.search,
		icon: null,
		iconClass: 'ti ti-search',
		active: searchOpen.value || q.value !== '',
		disabled: false,
		kind: 'search',
	}];

	if (allCustomSection.value) {
		items.push({
			key: allCustomSection.value.key,
			title: allCustomSection.value.title,
			icon: allCustomSection.value.icon,
			iconClass: null,
			active: browser.value === 'custom' && activeCustomSectionKey.value === ALL_CUSTOM_SECTION_KEY,
			disabled: false,
			kind: 'custom-all',
		});
	}

	if (pinnedSection.value) {
		items.push({
			key: pinnedSection.value.key,
			title: pinnedSection.value.title,
			icon: null,
			iconClass: 'ti ti-heart',
			active: browser.value === 'pinned',
			disabled: false,
			kind: 'pinned',
		});
	}

	if (browser.value === 'unicode') {
		items.push(...unicodeSections.value.map(section => ({
			key: section.key,
			title: section.title,
			icon: section.icon,
			iconClass: null,
			active: activeUnicodeSectionKey.value === section.key,
			disabled: false,
			kind: 'unicode-section',
		} satisfies BottomTabItem)));
	} else {
		items.push(...customSections.value.map(section => ({
			key: section.key,
			title: section.title,
			icon: section.icon,
			iconClass: null,
			active: browser.value === 'custom' && activeCustomSectionKey.value === section.key,
			disabled: false,
			kind: 'custom-section',
		} satisfies BottomTabItem)));

		if (unicodeSections.value.length > 0) {
			items.push({
				key: '__unicode_switch__',
				title: i18n.ts.emoji,
				icon: '😀',
				iconClass: null,
				active: false,
				disabled: false,
				kind: 'unicode-switch',
			});
		}
	}

	return items;
});

watch(customSections, (sections) => {
	if (sections.length === 0) {
		activeCustomSectionKey.value = ALL_CUSTOM_SECTION_KEY;
		if (browser.value === 'custom') {
			browser.value = unicodeSections.value.length > 0 ? 'unicode' : 'pinned';
		}
		return;
	}

	if (activeCustomSectionKey.value !== ALL_CUSTOM_SECTION_KEY && !sections.some(section => section.key === activeCustomSectionKey.value)) {
		activeCustomSectionKey.value = ALL_CUSTOM_SECTION_KEY;
	}
}, { immediate: true });

watch(unicodeSections, (sections) => {
	if (sections.length === 0) {
		activeUnicodeSectionKey.value = null;
		return;
	}

	if (!activeUnicodeSectionKey.value || !sections.some(section => section.key === activeUnicodeSectionKey.value)) {
		activeUnicodeSectionKey.value = sections[0].key;
	}
}, { immediate: true });

watch(q, () => {
	if (emojisEl.value) emojisEl.value.scrollTop = 0;

	if (q.value === '') {
		searchResultCustom.value = [];
		searchResultUnicode.value = [];
		return;
	}

	const newQ = q.value.replace(/:/g, '').toLowerCase();

	const searchCustom = () => {
		const max = 100;
		const emojis = customEmojis.value;
		const matches = new Set<Misskey.entities.EmojiSimple>();

		const exactMatch = emojis.find(emoji => emoji.name === newQ);
		if (exactMatch) matches.add(exactMatch);

		if (newQ.includes(' ')) {
			const keywords = newQ.split(' ');

			for (const emoji of emojis) {
				if (keywords.every(keyword => emoji.name.includes(keyword))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (keywords.every(keyword => emoji.name.includes(keyword) || emoji.aliases.some(alias => alias.includes(keyword)))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
		} else {
			if (customEmojisMap.has(newQ)) {
				matches.add(customEmojisMap.get(newQ)!);
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.aliases.some(alias => alias === newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.name.startsWith(newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.aliases.some(alias => alias.startsWith(newQ))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.name.includes(newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.aliases.some(alias => alias.includes(newQ))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
		}

		return matches;
	};

	const searchUnicode = () => {
		const max = 100;
		const emojis = emojilist;
		const matches = new Set<UnicodeEmojiDef>();

		const exactMatch = emojis.find(emoji => emoji.name === newQ);
		if (exactMatch) matches.add(exactMatch);

		if (newQ.includes(' ')) {
			const keywords = newQ.split(' ');

			for (const emoji of emojis) {
				if (keywords.every(keyword => emoji.name.includes(keyword))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const index of Object.values(store.s.additionalUnicodeEmojiIndexes)) {
				for (const emoji of emojis) {
					if (keywords.every(keyword => index[emoji.char]?.some(k => k.includes(keyword)))) {
						matches.add(emoji);
						if (matches.size >= max) break;
					}
				}
			}
		} else {
			for (const emoji of emojis) {
				if (emoji.name.startsWith(newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const index of Object.values(store.s.additionalUnicodeEmojiIndexes)) {
				for (const emoji of emojis) {
					if (index[emoji.char]?.some(k => k.startsWith(newQ))) {
						matches.add(emoji);
						if (matches.size >= max) break;
					}
				}
			}

			for (const emoji of emojis) {
				if (emoji.name.includes(newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const index of Object.values(store.s.additionalUnicodeEmojiIndexes)) {
				for (const emoji of emojis) {
					if (index[emoji.char]?.some(k => k.includes(newQ))) {
						matches.add(emoji);
						if (matches.size >= max) break;
					}
				}
			}
		}

		return matches;
	};

	searchResultCustom.value = Array.from(searchCustom());
	searchResultUnicode.value = Array.from(searchUnicode());
	searchOpen.value = true;
});

function canReact(emoji: Misskey.entities.EmojiSimple | UnicodeEmojiDef | string): boolean {
	return !props.targetNote || checkReactionPermissions($i!, props.targetNote, emoji);
}

function filterCategory(emoji: Misskey.entities.EmojiSimple, category: string): boolean {
	return category === '' ? (emoji.category === 'null' || !emoji.category) : emoji.category === category;
}

function getCustomCategoryKey(category: string): string {
	return category === '' ? OTHER_CUSTOM_CATEGORY_KEY : category;
}

function getCustomCategoryLabel(category: string): string {
	if (category === '') return i18n.ts.other;
	const parts = category.split('/').map(part => part.trim()).filter(Boolean);
	return parts.at(-1) ?? i18n.ts.other;
}

function humanizeUnicodeCategory(category: string): string {
	return category.replaceAll('_', ' ');
}

function activateBottomTab(item: BottomTabItem) {
	switch (item.kind) {
		case 'search':
			if (searchOpen.value || q.value !== '') {
				nextTick(() => focus());
			} else {
				searchOpen.value = true;
				nextTick(() => focus());
			}
			break;
		case 'custom-all':
			browser.value = 'custom';
			activeCustomSectionKey.value = ALL_CUSTOM_SECTION_KEY;
			closeSearch();
			break;
		case 'custom-section':
			browser.value = 'custom';
			activeCustomSectionKey.value = item.key;
			closeSearch();
			break;
		case 'pinned':
			browser.value = 'pinned';
			closeSearch();
			break;
		case 'unicode-switch':
			browser.value = 'unicode';
			closeSearch();
			break;
		case 'unicode-section':
			browser.value = 'unicode';
			activeUnicodeSectionKey.value = item.key;
			closeSearch();
			break;
	}

	if (emojisEl.value) emojisEl.value.scrollTop = 0;
}

function focus() {
	if (!['smartphone', 'tablet'].includes(deviceKind) && !isTouchUsing && (searchOpen.value || q.value !== '')) {
		searchEl.value?.focus({
			preventScroll: true,
		});
	}
}

function reset() {
	if (emojisEl.value) emojisEl.value.scrollTop = 0;
	q.value = '';
	searchOpen.value = false;
}

function closeSearch(clear = true) {
	if (clear) q.value = '';
	searchOpen.value = false;
}

function getKey(emoji: string | Misskey.entities.EmojiSimple | UnicodeEmojiDef): string {
	return typeof emoji === 'string' ? emoji : 'char' in emoji ? emoji.char : `:${emoji.name}:`;
}

function getDef(emoji: string): string | Misskey.entities.EmojiSimple | UnicodeEmojiDef {
	if (emoji.includes(':')) {
		const name = emoji.replaceAll(':', '');
		return customEmojisMap.get(name) ?? emoji;
	} else {
		return getUnicodeEmoji(emoji);
	}
}

function computeButtonTitle(ev: PointerEvent): void {
	const elm = ev.target as HTMLElement;
	const emoji = elm.dataset.emoji as string;
	elm.title = getEmojiName(emoji);
}

function chosen(emoji: string | Misskey.entities.EmojiSimple | UnicodeEmojiDef, ev?: PointerEvent) {
	const el = ev && (ev.currentTarget ?? ev.target) as HTMLElement | null | undefined;
	if (el && prefer.s.animation) {
		const rect = el.getBoundingClientRect();
		const x = rect.left + (el.offsetWidth / 2);
		const y = rect.top + (el.offsetHeight / 2);
		const { dispose } = os.popup(MkRippleEffect, { x, y }, {
			end: () => dispose(),
		});
	}

	const key = getKey(emoji);
	emit('chosen', key);

	haptic();

	if (!pinned.value.includes(key)) {
		let recents = store.s.recentlyUsedEmojis;
		recents = recents.filter((emoji) => emoji !== key);
		recents.unshift(key);
		store.set('recentlyUsedEmojis', recents.splice(0, 32));
	}
}

function input(): void {
	q.value = searchEl.value?.value.trim() ?? '';
}

function paste(event: ClipboardEvent): void {
	const pasted = event.clipboardData?.getData('text') ?? '';
	if (done(pasted)) {
		event.preventDefault();
	}
}

function onKeydown(ev: KeyboardEvent) {
	if (ev.isComposing || ev.key === 'Process' || ev.keyCode === 229) return;
	if (ev.key === 'Enter') {
		ev.preventDefault();
		ev.stopPropagation();
		done();
	}
	if (ev.key === 'Escape') {
		ev.preventDefault();
		ev.stopPropagation();
		if (q.value !== '' || searchOpen.value) {
			closeSearch();
			return;
		}
		emit('esc');
	}
}

function done(query?: string): boolean | void {
	if (query == null) query = q.value;
	if (query == null || typeof query !== 'string') return;

	const q2 = query.replace(/:/g, '');
	const exactMatchCustom = customEmojisMap.get(q2);
	if (exactMatchCustom) {
		chosen(exactMatchCustom);
		return true;
	}
	const exactMatchUnicode = emojilist.find(emoji => emoji.char === q2 || emoji.name === q2);
	if (exactMatchUnicode) {
		chosen(exactMatchUnicode);
		return true;
	}
	if (searchResultCustom.value.length > 0) {
		chosen(searchResultCustom.value[0]);
		return true;
	}
	if (searchResultUnicode.value.length > 0) {
		chosen(searchResultUnicode.value[0]);
		return true;
	}
}

onMounted(() => {
	if (browser.value === 'pinned' && pinnedSection.value == null) {
		browser.value = allCustomSection.value ? 'custom' : 'unicode';
	}
});

defineExpose({
	focus,
	reset,
});
</script>

<style lang="scss" scoped>
.omfetrab {
	$pad: 8px;

	display: flex;
	flex-direction: column;

	&.s1 {
		--eachSize: 40px;
	}

	&.s2 {
		--eachSize: 45px;
	}

	&.s3 {
		--eachSize: 50px;
	}

	&.s4 {
		--eachSize: 55px;
	}

	&.s5 {
		--eachSize: 60px;
	}

	&.w1 {
		--columns: 5;
	}

	&.w2 {
		--columns: 6;
	}

	&.w3 {
		--columns: 7;
	}

	&.w4 {
		--columns: 8;
	}

	&.w5 {
		--columns: 9;
	}

	&.h1 {
		--rows: 4;
	}

	&.h2 {
		--rows: 6;
	}

	&.h3 {
		--rows: 8;
	}

	&.h4 {
		--rows: 10;
	}

	width: calc((var(--eachSize) * var(--columns)) + (#{$pad} * 2));
	height: calc((var(--eachSize) * var(--rows)) + (#{$pad} * 2));

	> .searchBar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-bottom: solid 0.5px var(--MI_THEME-divider);

		> .search {
			flex: 1;
			min-width: 0;
			padding: 0;
			box-sizing: border-box;
			font-size: 1em;
			outline: none;
			border: none;
			background: transparent;
			color: var(--MI_THEME-fg);
		}

		> .searchClose {
			flex: 0 0 auto;
			width: 32px;
			height: 32px;
			border-radius: 999px;
			color: var(--MI_THEME-fgTransparentStrong);
		}
	}

	> .bottomBar {
		display: flex;
		gap: 8px;
		padding: 8px;
		overflow-x: auto;
		scrollbar-width: none;
		border-top: solid 0.5px var(--MI_THEME-divider);

		&::-webkit-scrollbar {
			display: none;
		}

		> .bottomTab {
			flex: 0 0 auto;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: calc(var(--eachSize) - 6px);
			height: calc(var(--eachSize) - 6px);
			min-width: 0;
			padding: 0;
			border-radius: 12px;
			background: transparent;
			border: 1px solid transparent;
			color: var(--MI_THEME-fg);
			transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;

			&:hover {
				background: var(--MI_THEME-panelHighlight);
			}

			&.active {
				background: color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panel));
				border-color: color-mix(in srgb, var(--MI_THEME-accent) 40%, transparent);
				color: var(--MI_THEME-accent);
			}

			&:active {
				transform: scale(0.96);
			}

			> .emoji {
				height: 1.25em;
				vertical-align: -.25em;
				pointer-events: none;
				width: 100%;
				object-fit: contain;
			}
		}
	}

	> .emojis {
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: none;

		> .contentSection,
		> .resultSection {
			padding: 8px 0;
		}

		.body {
			position: relative;
			display: grid;
			grid-template-columns: repeat(var(--columns), 1fr);
			padding: $pad;
			font-size: 30px;

			&.compact {
				padding-top: 0;
			}

			> .item {
				position: relative;
				padding: 0 3px;
				width: var(--eachSize);
				height: var(--eachSize);
				contain: strict;
				border-radius: 8px;
				font-size: 24px;

				&:hover {
					background: rgba(0, 0, 0, 0.05);
				}

				&:active {
					background: var(--MI_THEME-accent);
					box-shadow: inset 0 0.15em 0.3em rgba(27, 31, 35, 0.15);
				}

				&:disabled {
					cursor: not-allowed;
					background: linear-gradient(-45deg, transparent 0% 48%, light-dark(rgba(0, 0, 0, 0.25), rgba(255, 255, 255, 0.15)) 48% 52%, transparent 52% 100%);
					opacity: 1;

					> .emoji {
						filter: grayscale(1);
						mix-blend-mode: exclusion;
						opacity: 0.8;
					}
				}

				> .emoji {
					height: 1.25em;
					vertical-align: -.25em;
					pointer-events: none;
					width: 100%;
					object-fit: contain;
				}
			}
		}
	}

	&.asDrawer,
	&.asWindow {
		width: 100% !important;

		> .emojis {
			.body {
				> .item {
					aspect-ratio: 1 / 1;
					width: auto;
					height: auto;
					min-width: 0;
				}
			}
		}
	}

	&.asWindow {
		height: 100% !important;
	}
}

.sectionTitle {
	padding: 0 12px;
	font-size: 12px;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentStrong);
}

.categoryFallback {
	font-size: 13px;
	font-weight: 700;
	letter-spacing: 0.04em;
	color: currentColor;
}

.emptyState {
	padding: 24px 16px;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
