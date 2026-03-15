<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="omfetrab" :class="['s' + size, 'w' + width, 'h' + height, { asDrawer, asWindow }]" :style="{ maxHeight: maxHeight ? maxHeight + 'px' : undefined }">
	<!-- FirefoxのTabフォーカスが想定外の挙動となるためtabindex="-1"を追加 https://github.com/misskey-dev/misskey/issues/10744 -->
	<div ref="emojisEl" class="emojis" tabindex="-1">
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
	</div>

	<div class="bottomBar">
		<button v-if="showPrevArrow" class="_button navArrow" title="Previous" aria-label="Previous" @click="goToPreviousPage">
			<i class="ti ti-chevron-left"></i>
		</button>
		<div class="bottomBarViewport">
			<Transition :name="pageTransitionName" mode="out-in">
				<div
					:key="pageKey"
					class="bottomBarPage"
					:style="bottomBarPageStyle"
				>
					<button
						v-for="section in visibleBottomSections"
						:key="section.key"
						:data-section-key="section.key"
						class="_button bottomTab"
						:class="{ active: section.key === activeSectionKey }"
						:title="section.title"
						:aria-label="section.title"
						@click="selectSection(section.key)"
					>
						<i v-if="section.iconClass" :class="section.iconClass"></i>
						<MkCustomEmoji v-else-if="section.icon?.startsWith(':')" class="emoji" :name="section.icon" :normal="true" :fallbackToImage="true"/>
						<MkEmoji v-else-if="section.icon" class="emoji" :emoji="section.icon" :normal="true"/>
						<span v-else class="categoryFallback">{{ section.title.slice(0, 1).toUpperCase() }}</span>
					</button>
				</div>
			</Transition>
		</div>
		<button v-if="showNextArrow" class="_button navArrow" :title="i18n.ts.next" :aria-label="i18n.ts.next" @click="goToNextPage">
			<i class="ti ti-chevron-right"></i>
		</button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, watch } from 'vue';
import * as Misskey from 'misskey-js';
import {
	emojiCharByCategory,
	unicodeEmojiCategories as categories,
	getEmojiName,
	getUnicodeEmoji,
} from '@@/js/emojilist.js';
import type { UnicodeEmojiDef } from '@@/js/emojilist.js';
import MkRippleEffect from '@/components/MkRippleEffect.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { store } from '@/store.js';
import { customEmojiCategories, customEmojis, customEmojisMap } from '@/custom-emojis.js';
import { $i } from '@/i.js';
import { checkReactionPermissions } from '@/utility/check-reaction-permissions.js';
import { prefer } from '@/preferences.js';
import { haptic } from '@/utility/haptic.js';

type PickerSection = {
	key: string;
	title: string;
	emojis: string[];
	disabledEmojis: string[];
	icon: string | null;
	iconClass: string | null;
};

const OTHER_CUSTOM_CATEGORY_KEY = '__other__';

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
const size = computed(() => emojiPickerScale.value);
const width = computed(() => emojiPickerWidth.value);
const height = computed(() => emojiPickerHeight.value);

const customSections = computed<PickerSection[]>(() => {
	return customEmojiCategories.value
		.map(category => category ?? '')
		.map(category => {
			const emojis = customEmojis.value.filter(emoji => filterCategory(emoji, category));
			if (emojis.length === 0) return null;

			return {
				key: getCustomCategoryKey(category),
				title: getCustomCategoryLabel(category),
				emojis: emojis.map(emoji => `:${emoji.name}:`),
				disabledEmojis: emojis.filter(emoji => !canReact(emoji)).map(emoji => `:${emoji.name}:`),
				icon: emojis[0] ? `:${emojis[0].name}:` : null,
				iconClass: null,
			} satisfies PickerSection;
		})
		.filter((section): section is PickerSection => section != null);
});

const unicodeSections = computed<PickerSection[]>(() => {
	return categories.map(category => {
		const emojis = emojiCharByCategory.get(category) ?? [];
		return {
			key: category,
			title: humanizeUnicodeCategory(category),
			emojis,
			disabledEmojis: [],
			icon: emojis[0] ?? null,
			iconClass: null,
		} satisfies PickerSection;
	});
});

const bottomSections = computed<PickerSection[]>(() => {
	return [
		...customSections.value,
		...unicodeSections.value,
	];
});

const totalNavSlots = computed(() => width.value + 4);
const activeSectionKey = ref<string>('');
const currentPageIndex = ref(0);
const pageTransitionDirection = ref<'forward' | 'backward'>('forward');

const activeSection = computed(() => {
	return bottomSections.value.find(section => section.key === activeSectionKey.value) ?? bottomSections.value[0] ?? null;
});

const sectionPages = computed(() => {
	return paginateSections(bottomSections.value, totalNavSlots.value);
});

const visibleBottomSections = computed(() => {
	return sectionPages.value[currentPageIndex.value] ?? [];
});

const showPrevArrow = computed(() => currentPageIndex.value > 0);
const showNextArrow = computed(() => currentPageIndex.value < sectionPages.value.length - 1);
const pageTransitionName = computed(() => pageTransitionDirection.value === 'forward' ? 'tabPageForward' : 'tabPageBackward');
const bottomBarPageStyle = computed(() => {
	return {
		'--bottomBarCount': `${Math.max(visibleBottomSections.value.length, 1)}`,
	};
});
const pageKey = computed(() => {
	const keys = visibleBottomSections.value.map(section => section.key).join('|');
	return `${currentPageIndex.value}:${keys || 'empty'}`;
});

watch([bottomSections, sectionPages], ([sections, pages]) => {
	if (sections.length === 0) {
		activeSectionKey.value = '';
		currentPageIndex.value = 0;
		return;
	}

	if (!sections.some(section => section.key === activeSectionKey.value)) {
		activeSectionKey.value = sections[0].key;
	}

	const pageIndex = findPageIndex(activeSectionKey.value, pages);
	currentPageIndex.value = pageIndex === -1 ? 0 : pageIndex;
}, { immediate: true });

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

function selectSection(key: string) {
	activeSectionKey.value = key;
	const pageIndex = findPageIndex(key);
	if (pageIndex !== -1 && pageIndex !== currentPageIndex.value) {
		pageTransitionDirection.value = pageIndex > currentPageIndex.value ? 'forward' : 'backward';
		currentPageIndex.value = pageIndex;
	}
	if (emojisEl.value) emojisEl.value.scrollTop = 0;
}

function goToPreviousPage() {
	if (!showPrevArrow.value) return;

	pageTransitionDirection.value = 'backward';
	currentPageIndex.value -= 1;
	const firstSection = visibleBottomSections.value[0];
	if (firstSection) activeSectionKey.value = firstSection.key;
	if (emojisEl.value) emojisEl.value.scrollTop = 0;
}

function goToNextPage() {
	if (!showNextArrow.value) return;

	pageTransitionDirection.value = 'forward';
	currentPageIndex.value += 1;
	const firstSection = visibleBottomSections.value[0];
	if (firstSection) activeSectionKey.value = firstSection.key;
	if (emojisEl.value) emojisEl.value.scrollTop = 0;
}

function findPageIndex(key: string, pages = sectionPages.value): number {
	return pages.findIndex(page => page.some(section => section.key === key));
}

function paginateSections(sections: PickerSection[], slots: number): PickerSection[][] {
	if (sections.length === 0) return [];
	if (sections.length <= slots) return [sections];

	const pages: PickerSection[][] = [];
	const firstOrLastPageSize = Math.max(slots - 1, 1);
	const middlePageSize = Math.max(slots - 2, 1);
	let index = 0;

	pages.push(sections.slice(index, index + firstOrLastPageSize));
	index += firstOrLastPageSize;

	while (index < sections.length) {
		const remaining = sections.length - index;
		if (remaining <= firstOrLastPageSize) {
			pages.push(sections.slice(index));
			break;
		}

		pages.push(sections.slice(index, index + middlePageSize));
		index += middlePageSize;
	}

	return pages;
}

function focus() {
	// nop
}

function reset() {
	if (emojisEl.value) emojisEl.value.scrollTop = 0;
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

	> .bottomBar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px;
		border-top: solid 0.5px var(--MI_THEME-divider);

		> .navArrow,
		> .bottomBarViewport .bottomTab {
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

		> .bottomBarViewport {
			flex: 1 1 auto;
			min-width: 0;
			overflow: hidden;

			> .bottomBarPage {
				display: grid;
				grid-template-columns: repeat(var(--bottomBarCount), minmax(0, 1fr));
				gap: 8px;
				align-items: center;

				> .bottomTab {
					justify-self: center;
				}
			}
		}
	}

	> .emojis {
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: none;

		> .contentSection {
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

.tabPageForward-enter-active,
.tabPageForward-leave-active,
.tabPageBackward-enter-active,
.tabPageBackward-leave-active {
	transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease;
}

.tabPageForward-enter-from,
.tabPageBackward-leave-to {
	opacity: 0;
	transform: translateX(16px);
}

.tabPageForward-leave-to,
.tabPageBackward-enter-from {
	opacity: 0;
	transform: translateX(-16px);
}
</style>
