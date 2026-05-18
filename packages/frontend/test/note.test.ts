/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach, vi } from 'vitest';
import { render, cleanup, type RenderResult } from '@testing-library/vue';
import './init';
import * as Misskey from 'misskey-js';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import MkMediaImage from '@/components/MkMediaImage.vue';
import MkMediaList from '@/components/MkMediaList.vue';

type LightboxFilter = (...args: unknown[]) => unknown;

const { lightboxInstances } = vi.hoisted(() => {
	return {
		lightboxInstances: [] as { options: { dataSource?: unknown[] }; filters: Record<string, LightboxFilter[]> }[],
	};
});

vi.mock('photoswipe/lightbox', () => {
	return {
		default: class PhotoSwipeLightbox {
			public options: { dataSource?: unknown[] };
			public filters: Record<string, LightboxFilter[]> = {};

			constructor(options: { dataSource?: unknown[] }) {
				this.options = options;
				lightboxInstances.push(this);
			}

			public addFilter(name: string, fn: LightboxFilter) {
				this.filters[name] ??= [];
				this.filters[name].push(fn);
				return undefined;
			}

			public on() {
				return undefined;
			}

			public init() {
				return undefined;
			}

			public destroy() {
				return undefined;
			}

			public loadAndOpen() {
				return undefined;
			}
		},
	};
});

vi.mock('photoswipe', () => {
	return {
		default: class PhotoSwipe {
		},
	};
});

describe('MkMediaImage', () => {
	const renderMediaImage = (image: Partial<Misskey.entities.DriveFile>): RenderResult => {
		return render(MkMediaImage, {
			props: {
				image: {
					id: 'xxxxxxxx',
					createdAt: (new Date()).toJSON(),
					isSensitive: false,
					name: 'example.png',
					thumbnailUrl: null,
					url: '',
					type: 'application/octet-stream',
					size: 1,
					md5: '15eca7fba0480996e2245f5185bf39f2',
					blurhash: null,
					comment: null,
					properties: {},
					...image,
				} as Misskey.entities.DriveFile,
			},
			global: { directives, components },
		});
	};

	afterEach(() => {
		cleanup();
		lightboxInstances.length = 0;
	});

	test('Attaching JPG should show no indicator', async () => {
		const mkMediaImage = renderMediaImage({
			type: 'image/jpeg',
		});
		const [gif, alt] = await Promise.all([
			mkMediaImage.queryByText('GIF'),
			mkMediaImage.queryByText('ALT'),
		]);
		assert.ok(!gif);
		assert.ok(!alt);
	});

	test('Attaching GIF should show a GIF indicator', async () => {
		const mkMediaImage = renderMediaImage({
			type: 'image/gif',
		});
		const [gif, alt] = await Promise.all([
			mkMediaImage.queryByText('GIF'),
			mkMediaImage.queryByText('ALT'),
		]);
		assert.ok(gif);
		assert.ok(!alt);
	});

	test('Attaching APNG should show a GIF indicator', async () => {
		const mkMediaImage = renderMediaImage({
			type: 'image/apng',
		});
		const [gif, alt] = await Promise.all([
			mkMediaImage.queryByText('GIF'),
			mkMediaImage.queryByText('ALT'),
		]);
		assert.ok(gif);
		assert.ok(!alt);
	});

	test('Attaching image with an alt message should show an ALT indicator', async () => {
		const mkMediaImage = renderMediaImage({
			type: 'image/png',
			comment: 'Misskeyのロゴです',
		});
		const [gif, alt] = await Promise.all([
			mkMediaImage.queryByText('GIF'),
			mkMediaImage.queryByText('ALT'),
		]);
		assert.ok(!gif);
		assert.ok(alt);
	});

	test('Attaching GIF image with an alt message should show a GIF and an ALT indicator', async () => {
		const mkMediaImage = renderMediaImage({
			type: 'image/gif',
			comment: 'Misskeyのロゴです',
		});
		const [gif, alt] = await Promise.all([
			mkMediaImage.queryByText('GIF'),
			mkMediaImage.queryByText('ALT'),
		]);
		assert.ok(gif);
		assert.ok(alt);
	});
});

describe('MkMediaList', () => {
	const file = (index: number, override: Partial<Misskey.entities.DriveFile> = {}): Misskey.entities.DriveFile => {
		return {
			id: `file-${index}`,
			createdAt: (new Date()).toJSON(),
			isSensitive: false,
			name: `example-${index}.png`,
			thumbnailUrl: `https://example.test/thumb-${index}.png`,
			url: `https://example.test/image-${index}.png`,
			type: 'image/png',
			size: 1,
			md5: '15eca7fba0480996e2245f5185bf39f2',
			blurhash: null,
			comment: null,
			properties: {
				width: 800,
				height: 600,
			},
			...override,
		} as Misskey.entities.DriveFile;
	};

	const renderMediaList = (count: number): RenderResult => {
		return render(MkMediaList, {
			props: {
				mediaList: Array.from({ length: count }, (_, index) => file(index)),
			},
			global: { directives, components },
		});
	};

	const gallery = (view: RenderResult): HTMLElement => {
		const element = view.container.querySelector<HTMLElement>('[data-media-count]');
		if (element == null) {
			assert.fail('media gallery was not rendered');
		}
		return element;
	};

	afterEach(() => {
		cleanup();
		lightboxInstances.length = 0;
	});

	test('single image keeps the single-image layout', () => {
		const view = renderMediaList(1);
		const element = gallery(view);

		assert.strictEqual(element.dataset.mediaLayout, 'single');
		assert.strictEqual(element.dataset.mediaCount, '1');
		assert.strictEqual(element.dataset.visibleMediaCount, '1');
		assert.strictEqual(element.dataset.overflowCount, '0');
		assert.strictEqual(view.container.querySelectorAll('[data-id]').length, 1);
	});

	test.each([
		{ count: 2, layout: 'n2', visible: 2, overflow: 0 },
		{ count: 3, layout: 'n3', visible: 3, overflow: 0 },
		{ count: 4, layout: 'n4', visible: 4, overflow: 0 },
		{ count: 5, layout: 'grid', visible: 5, overflow: 0 },
		{ count: 9, layout: 'grid', visible: 9, overflow: 0 },
		{ count: 10, layout: 'grid', visible: 9, overflow: 1 },
		{ count: 18, layout: 'grid', visible: 9, overflow: 9 },
	])('$count images use the expected grid layout', ({ count, layout, visible, overflow }) => {
		const view = renderMediaList(count);
		const element = gallery(view);

		assert.strictEqual(element.dataset.mediaLayout, layout);
		assert.strictEqual(element.dataset.mediaCount, count.toString());
		assert.strictEqual(element.dataset.visibleMediaCount, visible.toString());
		assert.strictEqual(element.dataset.overflowCount, overflow.toString());
		assert.strictEqual(view.container.querySelectorAll('[data-id]').length, visible);
	});

	test('overflowing media shows a count on the ninth tile but keeps all images in the gallery', () => {
		const view = renderMediaList(18);
		const element = gallery(view);
		const overflowTile = view.container.querySelector<HTMLElement>('[data-overflow-label]');
		const lightbox = lightboxInstances[0];
		const numItemsFilter = lightbox.filters.numItems?.[0];
		const itemDataFilter = lightbox.filters.itemData?.[0];

		assert.strictEqual(element.dataset.overflowCount, '9');
		assert.strictEqual(overflowTile?.dataset.overflowLabel, '+9');
		assert.strictEqual(lightboxInstances.length, 1);
		assert.strictEqual(lightbox.options.dataSource?.length, 18);
		assert.ok(numItemsFilter);
		assert.ok(itemDataFilter);
		assert.strictEqual(numItemsFilter(9, { gallery: element }), 18);
		assert.deepStrictEqual(itemDataFilter({}, 10), {
			src: 'https://example.test/image-10.png',
			w: 800,
			h: 600,
			alt: 'example-10.png',
			comment: 'example-10.png',
			msrc: 'https://example.test/thumb-10.png',
			thumbCropped: true,
		});
	});
});
