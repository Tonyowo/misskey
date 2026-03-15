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
		<button v-if="showPrevArrow" class="_button navArrow" title="Previous" aria-label="Previous" @click="scrollRail('prev')">
			<i class="ti ti-chevron-left"></i>
		</button>
		<div ref="bottomBarTrack" class="bottomBarTrack" @scroll.passive="updateRailButtons">
			<button
				v-for="section in bottomSections"
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
		<button v-if="showNextArrow" class="_button navArrow" :title="i18n.ts.next" :aria-label="i18n.ts.next" @click="scrollRail('next')">
			<i class="ti ti-chevron-right"></i>
		</button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
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
const bottomBarTrack = useTemplateRef('bottomBarTrack');

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

const activeSectionKey = ref<string>('');
const showPrevArrow = ref(false);
const showNextArrow = ref(false);

const activeSection = computed(() => {
	return bottomSections.value.find(section => section.key === activeSectionKey.value) ?? bottomSections.value[0] ?? null;
});

watch(bottomSections, (sections) => {
	if (sections.length === 0) {
		activeSectionKey.value = '';
		return;
	}

	if (!sections.some(section => section.key === activeSectionKey.value)) {
		activeSectionKey.value = sections[0].key;
	}
	nextTick(() => {
		scrollActiveSectionIntoView(false);
		updateRailButtons();
	});
}, { immediate: true });

watch(activeSectionKey, () => {
	nextTick(() => {
		scrollActiveSectionIntoView();
		updateRailButtons();
	});
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

function selectSection(key: string) {
	activeSectionKey.value = key;
	if (emojisEl.value) emojisEl.value.scrollTop = 0;
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

	const amount = Math.max(rail.clientWidth * 0.75, 120);
	rail.scrollBy({
		left: direction === 'next' ? amount : -amount,
		behavior: 'smooth',
	});
}

function scrollActiveSectionIntoView(smooth = true) {
	const rail = bottomBarTrack.value;
	if (rail == null) return;

	const button = Array.from(rail.querySelectorAll<HTMLElement>('[data-section-key]'))
		.find(el => el.dataset.sectionKey === activeSectionKey.value);

	button?.scrollIntoView({
		behavior: smooth ? 'smooth' : 'auto',
		block: 'nearest',
		inline: 'center',
	});
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

onMounted(() => {
	updateRailButtons();
	window.addEventListener('resize', updateRailButtons);
});

onBeforeUnmount(() => {
	window.removeEventListener('resize', updateRailButtons);
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
		> .bottomBarTrack > .bottomTab {
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

		> .bottomBarTrack {
			flex: 1 1 auto;
			min-width: 0;
			display: flex;
			gap: 8px;
			overflow-x: auto;
			scrollbar-width: none;

			&::-webkit-scrollbar {
				display: none;
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
</style>
