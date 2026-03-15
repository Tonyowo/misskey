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
		<button
			v-for="section in bottomSections"
			:key="section.key"
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
const ALL_CUSTOM_SECTION_KEY = '__all_custom__';
const PINNED_SECTION_KEY = '__pinned__';

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
const pinnedEmojisDef = computed(() => {
	return pinned.value.map(getDef);
});

const size = computed(() => emojiPickerScale.value);
const width = computed(() => emojiPickerWidth.value);
const height = computed(() => emojiPickerHeight.value);

const allCustomSection = computed<PickerSection | null>(() => {
	if (customEmojis.value.length === 0) return null;

	return {
		key: ALL_CUSTOM_SECTION_KEY,
		title: `${i18n.ts.all}${i18n.ts.customEmojis}`,
		emojis: customEmojis.value.map(emoji => `:${emoji.name}:`),
		disabledEmojis: customEmojis.value.filter(emoji => !canReact(emoji)).map(emoji => `:${emoji.name}:`),
		icon: '🙂',
		iconClass: null,
	};
});

const pinnedSection = computed<PickerSection | null>(() => {
	if (!props.showPinned || pinnedEmojisDef.value.length === 0) return null;

	return {
		key: PINNED_SECTION_KEY,
		title: i18n.ts.pinned,
		emojis: pinnedEmojisDef.value.map(getKey),
		disabledEmojis: pinnedEmojisDef.value.filter(emoji => !canReact(emoji)).map(getKey),
		icon: null,
		iconClass: 'ti ti-heart',
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
		...(allCustomSection.value ? [allCustomSection.value] : []),
		...(pinnedSection.value ? [pinnedSection.value] : []),
		...customSections.value,
		...unicodeSections.value,
	];
});

const activeSectionKey = ref<string>(ALL_CUSTOM_SECTION_KEY);

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
	if (emojisEl.value) emojisEl.value.scrollTop = 0;
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
