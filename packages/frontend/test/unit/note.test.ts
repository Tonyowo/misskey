/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, type RenderResult } from '@testing-library/vue';
import * as Misskey from 'misskey-js';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import MkMediaImage from '@/components/MkMediaImage.vue';
import MkMediaList from '@/components/MkMediaList.vue';

const { openLightbox } = vi.hoisted(() => ({ openLightbox: vi.fn(async () => ({ dispose: vi.fn() })) }));
vi.mock('@/os.js', () => ({ popupAsyncWithDialog: openLightbox, popup: vi.fn(), popupMenu: vi.fn(), alert: vi.fn(), confirm: vi.fn(async () => ({ canceled: false })) }));

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
		openLightbox.mockClear();
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
		openLightbox.mockClear();
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

	test('overflowing media opens all eighteen files at the ninth tile', async () => {
		const view = renderMediaList(18);
		const overflowTile = view.container.querySelector<HTMLElement>('[data-overflow-label]');
		assert.strictEqual(overflowTile?.dataset.overflowLabel, '+9');
		const target = view.container.querySelector<HTMLElement>('[data-id="file-8"]');
		assert.ok(target);
		await fireEvent.click(target);
		assert.strictEqual(openLightbox.mock.calls.length, 1);
		const props = (openLightbox.mock.calls[0] as unknown as [unknown, { defaultIndex: number; contents: { id: string; url: string }[] }])[1];
		assert.strictEqual(props.defaultIndex, 8);
		assert.strictEqual(props.contents.length, 18);
		assert.strictEqual(props.contents[17].url, 'https://example.test/image-17.png');
	});
	test('keyboard opening preserves mixed image, video and audio attachments', async () => {
		const mediaList = Array.from({ length: 18 }, (_, index) => file(index, {
			type: index === 1 ? 'video/mp4' : index === 2 ? 'audio/wav' : 'image/png',
		}));
		const view = render(MkMediaList, { props: { mediaList }, global: { directives: { ...directives, panel: {} }, components } });
		const target = view.container.querySelector<HTMLElement>('[data-id="file-0"]');
		assert.ok(target);
		await fireEvent.keyDown(target, { key: 'Enter' });
		assert.strictEqual(openLightbox.mock.calls.length, 1);
		const props = (openLightbox.mock.calls[0] as unknown as [unknown, { defaultIndex: number; contents: { type: string }[] }])[1];
		assert.strictEqual(props.contents.length, 18);
		assert.strictEqual(props.contents[1].type, 'video');
		assert.strictEqual(props.contents[2].type, 'audio');
	});
});
