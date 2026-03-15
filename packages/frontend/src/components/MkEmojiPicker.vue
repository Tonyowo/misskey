<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="omfetrab" :class="['s' + size, 'w' + width, 'h' + height, { asDrawer, asWindow }]" :style="{ maxHeight: maxHeight ? maxHeight + 'px' : undefined }">
	<input
		ref="searchEl"
		:value="q"
		class="search"
		data-prevent-emoji-insert
		:class="{ filled: q != null && q !== '' }"
		:placeholder="i18n.ts.search"
		type="search"
		autocapitalize="off"
		@input="input()"
		@paste.stop="paste"
		@keydown="onKeydown"
	>
	<!-- FirefoxのTabフォーカスが想定外の挙動となるためtabindex="-1"を追加 https://github.com/misskey-dev/misskey/issues/10744 -->
	<div ref="emojisEl" class="emojis" tabindex="-1">
		<section class="result">
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
		</section>

		<div v-if="q === ''" class="group index">
			<section v-if="showPinned && (pinned && pinned.length > 0)">
				<div class="body">
					<button
						v-for="emoji in pinnedEmojisDef"
						:key="getKey(emoji)"
						:data-emoji="getKey(emoji)"
						class="_button item"
						:disabled="!canReact(emoji)"
						tabindex="0"
						@pointerenter="computeButtonTitle"
						@click="chosen(emoji, $event)"
					>
						<MkCustomEmoji v-if="!emoji.hasOwnProperty('char')" class="emoji" :name="getKey(emoji)" :normal="true" :fallbackToImage="true"/>
						<MkEmoji v-else class="emoji" :emoji="getKey(emoji)" :normal="true"/>
					</button>
					<button v-tooltip="i18n.ts.settings" class="_button config" @click="settings"><i class="ti ti-settings"></i></button>
				</div>
			</section>

			<section>
				<header class="_acrylic"><i class="ti ti-clock ti-fw"></i> {{ i18n.ts.recentUsed }}</header>
				<div class="body">
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
		</div>

		<div v-if="q === '' && tab === 'custom'" class="group browser">
			<section>
				<header class="_acrylic">{{ activeCustomSection?.title ?? i18n.ts.customEmojis }}</header>
				<div v-if="activeCustomSection" class="body">
					<button
						v-for="emoji in activeCustomSection.emojis"
						:key="emoji"
						:data-emoji="emoji"
						class="_button item"
						:disabled="activeCustomSection.disabledEmojis.includes(emoji)"
						@pointerenter="computeButtonTitle"
						@click="chosen(emoji, $event)"
					>
						<MkCustomEmoji class="emoji" :name="emoji" :normal="true" :fallbackToImage="true"/>
					</button>
				</div>
				<div v-else class="emptyState">{{ i18n.ts.noCustomEmojis }}</div>
			</section>
		</div>

		<div v-if="q === '' && tab === 'unicode'" class="group browser">
			<section>
				<header class="_acrylic">{{ activeUnicodeSection?.title ?? i18n.ts.emoji }}</header>
				<div class="body">
					<button
						v-for="emoji in activeUnicodeSection?.emojis ?? []"
						:key="emoji"
						:data-emoji="emoji"
						class="_button item"
						@pointerenter="computeButtonTitle"
						@click="chosen(emoji, $event)"
					>
						<MkEmoji class="emoji" :emoji="emoji" :normal="true"/>
					</button>
				</div>
			</section>
		</div>
	</div>

	<div v-if="showCategoryRail" class="categoryRail">
		<button
			v-for="section in currentSections"
			:key="`${tab}:${section.key}`"
			class="_button categoryTab"
			:class="{ active: section.key === activeSectionKey }"
			:title="section.title"
			:aria-label="section.title"
			@click="selectSection(section.key)"
		>
			<MkCustomEmoji v-if="section.icon?.startsWith(':')" class="emoji" :name="section.icon" :normal="true" :fallbackToImage="true"/>
			<MkEmoji v-else-if="section.icon" class="emoji" :emoji="section.icon" :normal="true"/>
			<span v-else class="categoryFallback">{{ section.label.slice(0, 1).toUpperCase() }}</span>
		</button>
	</div>

	<div class="tabs">
		<button class="_button tab" :class="{ active: tab === 'index' }" :title="i18n.ts.recentUsed" :aria-label="i18n.ts.recentUsed" @click="setTab('index')"><i class="ti ti-clock ti-fw"></i></button>
		<button class="_button tab" :class="{ active: tab === 'custom' }" :title="i18n.ts.customEmojis" :aria-label="i18n.ts.customEmojis" :disabled="customSections.length === 0" @click="setTab('custom')"><i class="ti ti-mood-smile ti-fw"></i></button>
		<button class="_button tab" :class="{ active: tab === 'unicode' }" :title="i18n.ts.emoji" :aria-label="i18n.ts.emoji" @click="setTab('unicode')"><i class="ti ti-icons ti-fw"></i></button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, watch, onMounted } from 'vue';
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
import { useRouter } from '@/router.js';
import { haptic } from '@/utility/haptic.js';

type PickerSection = {
	key: string;
	label: string;
	title: string;
	emojis: string[];
	disabledEmojis: string[];
	icon: string | null;
};

const OTHER_CUSTOM_CATEGORY_KEY = '__other__';

const router = useRouter();

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
const pinnedEmojisDef = computed(() => {
	return pinned.value?.map(getDef);
});

const pinned = computed(() => props.pinnedEmojis);
const size = computed(() => emojiPickerScale.value);
const width = computed(() => emojiPickerWidth.value);
const height = computed(() => emojiPickerHeight.value);
const q = ref<string>('');
const searchResultCustom = ref<Misskey.entities.EmojiSimple[]>([]);
const searchResultUnicode = ref<UnicodeEmojiDef[]>([]);
const tab = ref<'index' | 'custom' | 'unicode'>(customEmojis.value.length > 0 ? 'custom' : 'unicode');
const activeCustomSectionKey = ref<string | null>(null);
const activeUnicodeSectionKey = ref<string | null>(categories[0] ?? null);

const customSections = computed<PickerSection[]>(() => {
	return customEmojiCategories.value
		.map(category => category ?? '')
		.map(category => {
			const emojis = customEmojis.value.filter(emoji => filterCategory(emoji, category));
			if (emojis.length === 0) return null;

			return {
				key: getCustomCategoryKey(category),
				label: getCustomCategoryLabel(category),
				title: getCustomCategoryTitle(category),
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
	return customSections.value.find(section => section.key === activeCustomSectionKey.value) ?? customSections.value[0] ?? null;
});
const activeUnicodeSection = computed(() => {
	return unicodeSections.value.find(section => section.key === activeUnicodeSectionKey.value) ?? unicodeSections.value[0] ?? null;
});
const currentSections = computed(() => {
	if (tab.value === 'custom') return customSections.value;
	if (tab.value === 'unicode') return unicodeSections.value;
	return [];
});
const activeSectionKey = computed(() => {
	if (tab.value === 'custom') return activeCustomSection.value?.key ?? null;
	if (tab.value === 'unicode') return activeUnicodeSection.value?.key ?? null;
	return null;
});
const showCategoryRail = computed(() => q.value === '' && currentSections.value.length > 0);

watch(customSections, (sections) => {
	if (sections.length === 0) {
		activeCustomSectionKey.value = null;
		if (tab.value === 'custom') {
			tab.value = unicodeSections.value.length > 0 ? 'unicode' : 'index';
		}
		return;
	}

	if (!activeCustomSectionKey.value || !sections.some(section => section.key === activeCustomSectionKey.value)) {
		activeCustomSectionKey.value = sections[0].key;
	}
}, { immediate: true });

watch(unicodeSections, (sections) => {
	if (sections.length === 0) {
		activeUnicodeSectionKey.value = null;
		if (tab.value === 'unicode') {
			tab.value = customSections.value.length > 0 ? 'custom' : 'index';
		}
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

		if (newQ.includes(' ')) { // AND検索
			const keywords = newQ.split(' ');

			// 名前にキーワードが含まれている
			for (const emoji of emojis) {
				if (keywords.every(keyword => emoji.name.includes(keyword))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			// 名前またはエイリアスにキーワードが含まれている
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

		if (newQ.includes(' ')) { // AND検索
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

function getCustomCategoryTitle(category: string): string {
	return category === '' ? i18n.ts.other : category;
}

function humanizeUnicodeCategory(category: string): string {
	return category.replaceAll('_', ' ');
}

function setTab(nextTab: 'index' | 'custom' | 'unicode') {
	if (nextTab === 'custom' && customSections.value.length === 0) return;
	if (nextTab === 'unicode' && unicodeSections.value.length === 0) return;

	tab.value = nextTab;
	if (emojisEl.value) emojisEl.value.scrollTop = 0;
}

function selectSection(key: string) {
	if (tab.value === 'custom') {
		activeCustomSectionKey.value = key;
	}
	if (tab.value === 'unicode') {
		activeUnicodeSectionKey.value = key;
	}
	if (emojisEl.value) emojisEl.value.scrollTop = 0;
}

function focus() {
	if (!['smartphone', 'tablet'].includes(deviceKind) && !isTouchUsing) {
		searchEl.value?.focus({
			preventScroll: true,
		});
	}
}

function reset() {
	if (emojisEl.value) emojisEl.value.scrollTop = 0;
	q.value = '';
}

function getKey(emoji: string | Misskey.entities.EmojiSimple | UnicodeEmojiDef): string {
	return typeof emoji === 'string' ? emoji : 'char' in emoji ? emoji.char : `:${emoji.name}:`;
}

function getDef(emoji: string): string | Misskey.entities.EmojiSimple | UnicodeEmojiDef {
	if (emoji.includes(':')) {
		// カスタム絵文字が存在する場合はその情報を持つオブジェクトを返し、
		// サーバの管理画面から削除された等で情報が見つからない場合は名前の文字列をそのまま返しておく（undefinedを返すとエラーになるため）
		const name = emoji.replaceAll(':', '');
		return customEmojisMap.get(name) ?? emoji;
	} else {
		return getUnicodeEmoji(emoji);
	}
}

/** @see MkEmojiPicker.section.vue */
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

	// 最近使った絵文字更新
	if (!pinned.value?.includes(key)) {
		let recents = store.s.recentlyUsedEmojis;
		recents = recents.filter((emoji) => emoji !== key);
		recents.unshift(key);
		store.set('recentlyUsedEmojis', recents.splice(0, 32));
	}
}

function input(): void {
	// Using custom input event instead of v-model to respond immediately on
	// Android, where composition happens on all languages
	// (v-model does not update during composition)
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

function settings() {
	emit('esc');
	router.push('/settings/emoji-palette');
}

onMounted(() => {
	focus();
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

	&.asDrawer {
		width: 100% !important;

		> .emojis {
			::v-deep(section) {
				> header {
					height: 32px;
					line-height: 32px;
					padding: 0 12px;
					font-size: 15px;
				}

				> .body {
					display: grid;
					grid-template-columns: repeat(var(--columns), 1fr);
					font-size: 30px;

					> .config {
						aspect-ratio: 1 / 1;
						width: auto;
						height: auto;
						min-width: 0;
						font-size: 14px;
					}

					> .item {
						aspect-ratio: 1 / 1;
						width: auto;
						height: auto;
						min-width: 0;

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
					}
				}
			}
		}
	}

	&.asWindow {
		width: 100% !important;
		height: 100% !important;

		> .emojis {
			::v-deep(section) {
				> .body {
					display: grid;
					grid-template-columns: repeat(var(--columns), 1fr);
					font-size: 30px;

					> .item {
						aspect-ratio: 1 / 1;
						width: auto;
						height: auto;
						min-width: 0;
						padding: 0;

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
					}
				}
			}
		}
	}

	> .search {
		width: 100%;
		padding: 12px;
		box-sizing: border-box;
		font-size: 1em;
		outline: none;
		border: none;
		background: transparent;
		color: var(--MI_THEME-fg);

		&:not(:focus):not(.filled) {
			margin-bottom: env(safe-area-inset-bottom, 0px);
		}

		&:not(.filled) {
			order: 1;
			z-index: 2;
			box-shadow: 0px -1px 0 0px var(--MI_THEME-divider);
		}
	}

	> .categoryRail {
		display: flex;
		gap: 8px;
		padding: 8px;
		overflow-x: auto;
		scrollbar-width: none;
		border-top: solid 0.5px var(--MI_THEME-divider);
		order: 2;

		&::-webkit-scrollbar {
			display: none;
		}

		> .categoryTab {
			flex: 0 0 auto;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: calc(var(--eachSize) - 6px);
			height: calc(var(--eachSize) - 6px);
			min-width: 0;
			padding: 0;
			border-radius: 12px;
			background: var(--MI_THEME-panel);
			border: 1px solid transparent;
			transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;

			&:hover {
				background: var(--MI_THEME-panelHighlight);
			}

			&.active {
				background: color-mix(in srgb, var(--MI_THEME-accent) 14%, var(--MI_THEME-panel));
				border-color: color-mix(in srgb, var(--MI_THEME-accent) 40%, transparent);
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

	> .tabs {
		display: flex;
		order: 3;

		> .tab {
			flex: 1;
			height: 42px;
			border-top: solid 0.5px var(--MI_THEME-divider);

			&.active {
				border-top: solid 1px var(--MI_THEME-accent);
				color: var(--MI_THEME-accent);
			}

			&:disabled {
				opacity: 0.4;
				cursor: default;
			}
		}
	}

	> .emojis {
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: none;

		> .group {
			&:not(.index) {
				padding: 4px 0 8px 0;
				border-top: solid 0.5px var(--MI_THEME-divider);
			}

			> header {
				height: 32px;
				line-height: 32px;
				z-index: 2;
				padding: 0 8px;
				font-size: 12px;
			}
		}

		> .browser {
			> .emptyState {
				padding: 24px 16px;
				text-align: center;
				color: var(--MI_THEME-fgTransparentWeak);
			}
		}

		::v-deep(section) {
			> header {
				position: sticky;
				top: 0;
				left: 0;
				line-height: 28px;
				z-index: 1;
				padding: 0 8px;
				font-size: 12px;
			}

			> .body {
				position: relative;
				padding: $pad;

				> .config {
					position: relative;
					padding: 0 3px;
					width: var(--eachSize);
					height: var(--eachSize);
					contain: strict;
					opacity: 0.5;
				}

				> .item {
					position: relative;
					padding: 0 3px;
					width: var(--eachSize);
					height: var(--eachSize);
					contain: strict;
					border-radius: 4px;
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

			&.result {
				border-bottom: solid 0.5px var(--MI_THEME-divider);

				&:empty {
					display: none;
				}
			}
		}
	}
}

.categoryFallback {
	font-size: 13px;
	font-weight: 700;
	letter-spacing: 0.04em;
	color: var(--MI_THEME-fg);
}

.emptyState {
	padding: 24px 16px;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
