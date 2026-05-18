<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<XBanner v-for="media in mediaList.filter(media => !previewable(media))" :key="media.id" :media="media"/>
	<div v-if="previewableMediaList.length > 0" :class="$style.container">
		<div
			ref="gallery"
			:data-media-count="count"
			:data-visible-media-count="visibleMediaList.length"
			:data-overflow-count="overflowCount"
			:data-media-layout="layout"
			:class="[
				$style.medias,
				count === 1 ? [$style.n1, {
					[$style.n116_9]: prefer.s.mediaListWithOneImageAppearance === '16_9',
					[$style.n11_1]: prefer.s.mediaListWithOneImageAppearance === '1_1',
					[$style.n12_3]: prefer.s.mediaListWithOneImageAppearance === '2_3',
				}] : count === 2 ? $style.n2 : count === 3 ? $style.n3 : count === 4 ? $style.n4 : $style.nGrid,
			]"
		>
			<template v-for="(media, index) in visibleMediaList">
				<XVideo
					v-if="media.type.startsWith('video')"
					:key="`video:${media.id}`"
					:class="[$style.media, overflowCount > 0 && index === 8 ? $style.overflowTile : null]"
					:data-overflow-label="overflowCount > 0 && index === 8 ? `+${overflowCount}` : null"
					:video="media"
				/>
				<XImage
					v-else-if="media.type.startsWith('image')"
					:key="`image:${media.id}`"
					:class="[$style.media, overflowCount > 0 && index === 8 ? $style.overflowTile : null]"
					class="image"
					:data-id="media.id"
					:data-overflow-label="overflowCount > 0 && index === 8 ? `+${overflowCount}` : null"
					:image="media"
					:cover="count > 1"
					:showControls="count === 1"
					:raw="raw"
				/>
			</template>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import PhotoSwipe from 'photoswipe';
import type { DataSource, SlideData } from 'photoswipe';
import 'photoswipe/style.css';
import { FILE_TYPE_BROWSERSAFE } from '@@/js/const.js';
import XBanner from '@/components/MkMediaBanner.vue';
import XImage from '@/components/MkMediaImage.vue';
import XVideo from '@/components/MkMediaVideo.vue';
import * as os from '@/os.js';
import { focusParent } from '@/utility/focus.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	mediaList: Misskey.entities.DriveFile[];
	raw?: boolean;
}>();

const gallery = useTemplateRef('gallery');
const pswpZIndex = os.claimZIndex('middle');
window.document.documentElement.style.setProperty('--mk-pswp-root-z-index', pswpZIndex.toString());
const previewableMediaList = computed(() => props.mediaList.filter(media => previewable(media)));
const lightboxMediaList = computed(() => previewableMediaList.value.filter(media => lightboxable(media)));
const count = computed(() => previewableMediaList.value.length);
const visibleMediaList = computed(() => previewableMediaList.value.slice(0, 9));
const overflowCount = computed(() => Math.max(0, count.value - visibleMediaList.value.length));
const layout = computed(() => {
	if (count.value === 1) return 'single';
	if (count.value === 2) return 'n2';
	if (count.value === 3) return 'n3';
	if (count.value === 4) return 'n4';
	return 'grid';
});
let lightbox: PhotoSwipeLightbox | null = null;

let activeEl: HTMLElement | null = null;

const popstateHandler = (): void => {
	if (lightbox?.pswp && lightbox.pswp.isOpen === true) {
		lightbox.pswp.close();
	}
};

async function calcAspectRatio() {
	if (!gallery.value) return;

	const img = previewableMediaList.value[0];

	if (previewableMediaList.value.length !== 1 || !(img.properties.width && img.properties.height)) {
		gallery.value.style.aspectRatio = '';
		return;
	}

	const ratioMax = (ratio: number) => {
		if (img.properties.width == null || img.properties.height == null) return '';
		return `${Math.max(ratio, img.properties.width / img.properties.height).toString()} / 1`;
	};

	switch (prefer.s.mediaListWithOneImageAppearance) {
		case '16_9':
			gallery.value.style.aspectRatio = ratioMax(16 / 9);
			break;
		case '1_1':
			gallery.value.style.aspectRatio = ratioMax(1 / 1);
			break;
		case '2_3':
			gallery.value.style.aspectRatio = ratioMax(2 / 3);
			break;
		default:
			gallery.value.style.aspectRatio = '';
			break;
	}
}

onMounted(() => {
	calcAspectRatio();

	if (gallery.value == null) return; // TSを黙らすため

	lightbox = new PhotoSwipeLightbox({
		dataSource: lightboxMediaList.value.map(media => toPhotoSwipeItem(media)),
		gallery: gallery.value,
		mainClass: 'pswp',
		children: '.image',
		thumbSelector: '.image',
		loop: false,
		padding: window.innerWidth > 500 ? {
			top: 32,
			bottom: 90,
			left: 32,
			right: 32,
		} : {
			top: 0,
			bottom: 78,
			left: 0,
			right: 0,
		},
		imageClickAction: 'close',
		tapAction: 'close',
		bgOpacity: 1,
		showAnimationDuration: 100,
		hideAnimationDuration: 100,
		returnFocus: false,
		pswpModule: PhotoSwipe,
	});

	lightbox.addFilter('numItems', (numItems: number, dataSource: DataSource | undefined) => {
		if (dataSource != null && !Array.isArray(dataSource) && dataSource.gallery === gallery.value) {
			return lightboxMediaList.value.length;
		}

		return numItems;
	});

	lightbox.addFilter('itemData', (itemData: SlideData, index: number) => {
		// element is children
		const { element } = itemData;
		const id = element?.dataset.id;
		const file = id != null
			? lightboxMediaList.value.find(media => media.id === id)
			: lightboxMediaList.value[index];
		if (!file) return itemData;

		return {
			...itemData,
			...toPhotoSwipeItem(file),
			msrc: file.thumbnailUrl ?? undefined,
			thumbCropped: true,
		};
	});

	lightbox.on('uiRegister', () => {
		lightbox?.pswp?.ui?.registerElement({
			name: 'altText',
			className: 'pswp__alt-text-container',
			appendTo: 'wrapper',
			onInit: (el, pswp) => {
				const textBox = window.document.createElement('p');
				textBox.className = 'pswp__alt-text _acrylic';
				el.appendChild(textBox);

				pswp.on('change', () => {
					textBox.textContent = pswp.currSlide?.data.comment;
				});
			},
		});
	});

	lightbox.on('afterInit', () => {
		activeEl = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
		focusParent(activeEl, true, true);
		lightbox?.pswp?.element?.focus({
			preventScroll: true,
		});
		window.history.pushState(null, '', '#pswp');
	});

	lightbox.on('destroy', () => {
		focusParent(activeEl, true, false);
		activeEl = null;
		if (window.location.hash === '#pswp') {
			window.history.back();
		}
	});

	window.addEventListener('popstate', popstateHandler);

	lightbox.init();
});

onUnmounted(() => {
	window.removeEventListener('popstate', popstateHandler);
	lightbox?.destroy();
	lightbox = null;
	activeEl = null;
});

const previewable = (file: Misskey.entities.DriveFile): boolean => {
	if (file.type === 'image/svg+xml') return true; // svgのwebpublic/thumbnailはpngなのでtrue
	// FILE_TYPE_BROWSERSAFEに適合しないものはブラウザで表示するのに不適切
	return (file.type.startsWith('video') || file.type.startsWith('image')) && FILE_TYPE_BROWSERSAFE.includes(file.type);
};

const lightboxable = (file: Misskey.entities.DriveFile): boolean => {
	if (file.type === 'image/svg+xml') return true; // svgのwebpublicはpngなのでtrue
	return file.type.startsWith('image') && FILE_TYPE_BROWSERSAFE.includes(file.type);
};

const toPhotoSwipeItem = (file: Misskey.entities.DriveFile): SlideData => {
	const item: SlideData = {
		src: file.url,
		w: file.properties.width,
		h: file.properties.height,
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
		alt: file.comment || file.name,
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
		comment: file.comment || file.name,
	};
	if (file.properties.orientation != null && file.properties.orientation >= 5) {
		[item.w, item.h] = [item.h, item.w];
	}
	return item;
};

const openGallery = () => {
	if (previewableMediaList.value.length > 0) {
		lightbox?.loadAndOpen(0);
	}
};

defineExpose({
	openGallery,
});
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
}

.container {
	position: relative;
	width: 100%;
}

.medias {
	display: grid;
	grid-gap: 8px;

	height: 100%;
	width: 100%;

	&.n1 {
		grid-template-rows: 1fr;

		// default but fallback (expand)
		min-height: 64px;
		max-height: clamp(
			64px,
			50cqh,
			min(360px, 50vh)
		);

		&.n116_9 {
			min-height: initial;
			max-height: initial;
			aspect-ratio: 16 / 9; // fallback
		}

		&.n11_1{
			min-height: initial;
			max-height: initial;
			aspect-ratio: 1 / 1; // fallback
		}

		&.n12_3 {
			min-height: initial;
			max-height: initial;
			aspect-ratio: 2 / 3; // fallback
		}
	}

	&.n2 {
		grid-gap: 4px;
		grid-template-columns: 1fr 1fr;
		max-width: 376px;
	}

	&.n3 {
		grid-gap: 4px;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		max-width: 568px;
	}

	&.n4 {
		grid-gap: 4px;
		grid-template-columns: 1fr 1fr;
		max-width: 376px;
	}

	&.nGrid {
		grid-gap: 4px;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		max-width: 568px;
	}

	&.n2,
	&.n3,
	&.n4,
	&.nGrid {
		> .media {
			aspect-ratio: 1 / 1;
		}
	}
}

.media {
	overflow: hidden; // clipにするとバグる
	border-radius: 8px;
}

.medias:not(.n1) > .media {
	border-radius: 12px;
}

.medias:not(.n1) > .media :global(video) {
	object-fit: cover;
}

.overflowTile {
	position: relative;

	&::before,
	&::after {
		position: absolute;
		inset: 0;
		z-index: 5;
		pointer-events: none;
	}

	&::before {
		content: "";
		background: rgba(0, 0, 0, 0.48);
	}

	&::after {
		content: attr(data-overflow-label);
		display: grid;
		place-items: center;
		color: #fff;
		font-weight: 700;
		font-size: 1.35em;
		text-shadow: 0 1px 8px rgba(0, 0, 0, 0.45);
	}
}

:global(.pswp) {
	--pswp-root-z-index: var(--mk-pswp-root-z-index, 2000700) !important;
	--pswp-bg: var(--MI_THEME-modalBg) !important;
}
</style>

<style lang="scss">
.pswp__bg {
	background: var(--MI_THEME-modalBg);
	backdrop-filter: var(--MI-modalBgFilter);
}

.pswp__alt-text-container {
	display: flex;
	flex-direction: row;
	align-items: center;

	position: absolute;
	bottom: 20px;
	left: 50%;
	transform: translateX(-50%);

	width: 75%;
	max-width: 800px;
}

.pswp__alt-text {
	color: var(--MI_THEME-fg);
	margin: 0 auto;
	text-align: center;
	padding: var(--MI-margin);
	border-radius: var(--MI-radius);
	max-height: 8em;
	overflow-y: auto;
	text-shadow: var(--MI_THEME-bg) 0 0 10px, var(--MI_THEME-bg) 0 0 3px, var(--MI_THEME-bg) 0 0 3px;
	white-space: pre-line;
}
</style>
