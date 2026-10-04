/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { getRoomJoinCta } from '@/pages/chat/room-join-cta.js';

describe('getRoomJoinCta', () => {
	test('shows direct join for public rooms', () => {
		expect(getRoomJoinCta({
			joinPolicy: 'public',
			allowJoinRequest: true,
			joinRequestExists: false,
		}, 'available')).toMatchObject({
			action: 'join',
			text: '加入群聊',
			primary: true,
			disabled: false,
			notice: null,
		});
	});

	test('shows request action for request-required rooms', () => {
		expect(getRoomJoinCta({
			joinPolicy: 'request_required',
			allowJoinRequest: true,
			joinRequestExists: false,
		}, 'available')).toMatchObject({
			action: 'request',
			text: '申请加入',
			primary: true,
			disabled: false,
			notice: null,
		});
	});

	test('shows cancel only when a request exists', () => {
		expect(getRoomJoinCta({
			joinPolicy: 'invite_only',
			allowJoinRequest: false,
			joinRequestExists: true,
		}, 'available')).toMatchObject({
			action: 'cancel-request',
			text: '取消申请',
			disabled: false,
			notice: '入群申请正在处理中。',
		});
	});

	test('does not show cancel for invite-only rooms without a request', () => {
		expect(getRoomJoinCta({
			joinPolicy: 'invite_only',
			allowJoinRequest: true,
			joinRequestExists: false,
		}, 'available')).toMatchObject({
			action: 'none',
			text: '仅邀请加入',
			disabled: true,
			notice: '该群仅可通过邀请加入。',
		});
	});

	test('does not show request when join requests are disabled', () => {
		expect(getRoomJoinCta({
			joinPolicy: 'request_required',
			allowJoinRequest: false,
			joinRequestExists: false,
		}, 'available')).toMatchObject({
			action: 'none',
			text: '当前不接受申请',
			disabled: true,
			notice: '该群当前不接受入群申请。',
		});
	});

	test('disables join actions when chat is readonly', () => {
		expect(getRoomJoinCta({
			joinPolicy: 'public',
			allowJoinRequest: true,
			joinRequestExists: false,
		}, 'readonly')).toMatchObject({
			action: 'join',
			disabled: true,
			notice: '聊天功能当前为只读，无法加入群聊。',
		});
	});
});
