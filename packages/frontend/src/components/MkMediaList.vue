<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<XBanner v-for="media in medias.nonPreviewable" :key="media.id" :media="media"/>
	<div v-if="count > 0" :class="$style.container">
		<div
			ref="gallery"
			:data-media-count="count"
			:data-media-layout="count === 1 ? 'single' : count <= 4 ? `n${count}` : 'grid'"
			:data-visible-media-count="visibleMediaList.length"
			:data-overflow-count="overflowCount"
			:class="[
				$style.medias,
				
				count === 1 ? [$style.n1, {
					[$style.n116_9]: prefer.s.mediaListWithOneImageAppearance === '16_9',
					[$style.n11_1]: prefer.s.mediaListWithOneImageAppearance === '1_1',
					[$style.n12_3]: prefer.s.mediaListWithOneImageAppearance === '2_3',
				}] : count === 2 ? $style.n2 : count === 3 ? $style.n3 : count === 4 ? $style.n4 : $style.nMany,
			]"
		>
			<template v-for="(media, index) in visibleMediaList">
				<XAudio
					v-if="media.type.startsWith('audio')"
					:key="`audio:${media.id}`"
					:ref="(comp) => { mediaComponents.set(media.id, comp as InstanceType<typeof XAudio> | null); }" :class="[$style.media, overflowCount > 0 && index === 8 ? $style.overflowTile : null]"
					:data-overflow-label="overflowCount > 0 && index === 8 ? `+${overflowCount}` : null"
					:audio="media"
					@mediaClick="onMediaClick(media, $event)"
				/>
				<XVideo
					v-if="media.type.startsWith('video')"
					:key="`video:${media.id}`"
					:ref="(comp) => { mediaComponents.set(media.id, comp as InstanceType<typeof XVideo> | null); }"
					:class="[$style.media, overflowCount > 0 && index === 8 ? $style.overflowTile : null]" :data-overflow-label="overflowCount > 0 && index === 8 ? `+${overflowCount}` : null"
					:video="media"
					@mediaClick="onMediaClick(media, $event)"
				/>
				<XImage
					v-else-if="media.type.startsWith('image')"
					:key="`image:${media.id}`"
					:ref="(comp) => { mediaComponents.set(media.id, comp as InstanceType<typeof XImage> | null); }"
					:data-id="media.id"
					:marker="`${markerId}:${media.id}`"
					:disableImageLink="true"
					:cover="count > 1"
					:showControls="count === 1"
					:class="[$style.media, overflowCount > 0 && index === 8 ? $style.overflowTile : null]" :data-overflow-label="overflowCount > 0 && index === 8 ? `+${overflowCount}` : null"
					:image="media"
					:raw="raw"
					@mediaClick="onMediaClick(media, $event)"
				/>
			</template>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw, onMounted, onUnmounted, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import type { Content } from '@/components/MkLightbox.item.vue';
import type { MediaComponentExposes } from '@/types/media-component.js';
import XBanner from '@/components/MkMediaBanner.vue';
import XAudio from '@/components/MkMediaAudio.vue';
import XImage from '@/components/MkMediaImage.vue';
import XVideo from '@/components/MkMediaVideo.vue';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';
import { isPreviewable, getType } from '@/utility/lightbox.js';
import { genId } from '@/utility/id.js';

const props = defineProps<{
	mediaList: Misskey.entities.DriveFile[];
	user?: Misskey.entities.User | null; // DriveFileのuserはnullになることがある。その場合に使用する所有者情報
	raw?: boolean;
}>();

const gallery = useTemplateRef('gallery');
const medias = computed(() => {
	const previewable: Misskey.entities.DriveFile[] = [];
	const nonPreviewable: Misskey.entities.DriveFile[] = [];
	for (const file of props.mediaList) {
		if (isPreviewable(file.type)) {
			previewable.push(file);
		} else {
			nonPreviewable.push(file);
		}
	}

	return {
		previewable,
		nonPreviewable,
	};
});
const mediaComponents = new Map<string, MediaComponentExposes | null>();
const count = computed(() => medias.value.previewable.length);
const visibleMediaList = computed(() => medias.value.previewable.slice(0, 9));
const overflowCount = computed(() => Math.max(0, count.value - visibleMediaList.value.length));
const markerId = genId();

async function calcAspectRatio() {
	if (!gallery.value) return;

	const img = props.mediaList[0];

	if (props.mediaList.length !== 1 || !(img.properties.width && img.properties.height)) {
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
});

onUnmounted(() => {
	mediaComponents.clear();
});

function onMediaClick(file: Misskey.entities.DriveFile, event?: PointerEvent | KeyboardEvent) {
	if (prefer.s.imageNewTab) {
		window.open(file.url, '_blank');
		return;
	}
	openGallery(file.id, event?.currentTarget instanceof HTMLElement ? event.currentTarget : null);
}

async function openGallery(id?: string, returnFocusTo?: HTMLElement | null) {
	if (id == null) {
		const firstImage = medias.value.previewable[0];
		if (firstImage == null) return;
		id = firstImage.id;
	}

	const getElementByMarker = (marker: string) => {
		if (gallery.value == null) return null;
		const found = gallery.value.querySelector(`[data-marker="${marker}"]`) as HTMLElement | null;
		if (found == null) return null;
		return markRaw(found);
	};

	const contents = medias.value.previewable.map<Content>(media => ({
		id: media.id,
		type: getType(media.type),
		url: media.url,
		thumbnailUrl: media.thumbnailUrl,
		width: media.properties.width,
		height: media.properties.height,
		filename: media.name,
		file: media,
		sourceElement: getElementByMarker(`${markerId}:${media.id}`),
	}));

	const initiallyRevealedContentIds = contents
		.filter(content => mediaComponents.get(content.id)?.isRevealed() === true)
		.map(content => content.id);

	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkLightbox.vue').then(x => x.default), {
		returnFocusTo: returnFocusTo ?? (window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null),
		defaultIndex: contents.findIndex(conten => conten.id === id),
		contents: contents,
		initiallyRevealedContentIds,
		user: props.user,
	}, {
		closed: () => dispose(),
	});
}

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
		aspect-ratio: 16/9;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr;
	}

	&.n3 {
		grid-template-columns: repeat(3, 1fr);
		> .media { aspect-ratio: 1; }
	}

	&.n4 {
		aspect-ratio: 16/9;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
	}

	&.nMany {
		grid-template-columns: repeat(3, 1fr);

		> .media {
			aspect-ratio: 1;
		}
	}
}

.overflowTile {
	position: relative;
	&::after {
		content: attr(data-overflow-label);
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: color(from var(--MI_THEME-bg) srgb r g b / 0.65);
		color: var(--MI_THEME-fg);
		font-size: 2rem;
		pointer-events: none;
	}
}

.media {
	overflow: hidden; // clipにするとバグる
	border-radius: 8px;
	cursor: zoom-in;
}

@container (min-width: 500px) {
	.medias.gridInWideArea {
		display: grid;
		aspect-ratio: auto;
		grid-template-columns: repeat(4, 1fr);
		grid-template-rows: auto;
		grid-gap: 8px;

		> .media {
			aspect-ratio: 1 / 1;
		}
	}
}
</style>
