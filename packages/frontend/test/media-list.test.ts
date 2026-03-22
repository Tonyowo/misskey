/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import './init';
import MkMediaList from '@/components/MkMediaList.vue';

vi.mock('photoswipe/lightbox', () => ({
	default: class MockPhotoSwipeLightbox {
		public pswp = null;

		public addFilter() {}
		public on() {}
		public init() {}
		public destroy() {}
		public loadAndOpen() {}
	},
}));

vi.mock('photoswipe', () => ({
	default: class MockPhotoSwipe {},
}));

describe('MkMediaList', () => {
	const createFile = (id: string): Misskey.entities.DriveFile => ({
		id,
		createdAt: new Date().toJSON(),
		name: `${id}.png`,
		type: 'image/png',
		md5: id.padEnd(32, '0'),
		size: 1,
		isSensitive: false,
		blurhash: null,
		properties: {
			width: 800,
			height: 800,
		},
		url: `https://example.com/${id}.png`,
		thumbnailUrl: `https://example.com/${id}.thumb.png`,
		comment: null,
		folderId: null,
		folder: null,
		userId: null,
		user: null,
	});

	afterEach(() => {
		cleanup();
	});

	test('nine-grid layout keeps media order from the given list', () => {
		const mediaList = ['a', 'b', 'c', 'd', 'e', 'f'].map(createFile);
		const { container } = render(MkMediaList, {
			props: {
				mediaList,
				layout: 'nineGrid',
			},
			global: {
				stubs: {
					XBanner: true,
					XVideo: true,
					XImage: {
						props: ['image'],
						template: '<div class="image" :data-id="image.id"></div>',
					},
				},
			},
		});

		const gallery = container.querySelector('[data-layout="nineGrid"]');
		assert.ok(gallery);
		assert.equal(gallery?.getAttribute('data-count'), '6');

		const renderedIds = Array.from(container.querySelectorAll('.image'))
			.map((element) => element.getAttribute('data-id'));
		assert.deepEqual(renderedIds, mediaList.map((file) => file.id));

		const galleryChildren = Array.from(gallery?.children ?? []);
		assert.equal(galleryChildren.length, mediaList.length);
		assert.ok(galleryChildren.every((element) => element.querySelector('.image') != null));
	});
});
