/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type ChatAvailability = 'available' | 'readonly' | 'unavailable';

type RoomJoinState = {
	isJoined?: boolean;
	joinPolicy: 'public' | 'request_required' | 'invite_only';
	allowJoinRequest?: boolean;
	joinRequestExists?: boolean;
};

export type RoomJoinCta = {
	action: 'join' | 'request' | 'cancel-request' | 'none';
	icon: string;
	text: string;
	primary: boolean;
	disabled: boolean;
	notice: string | null;
};

export function getRoomJoinCta(room: RoomJoinState, chatAvailability: ChatAvailability): RoomJoinCta {
	const chatDisabled = chatAvailability !== 'available';
	const chatUnavailableNotice = chatAvailability === 'readonly'
		? '聊天功能当前为只读，无法加入群聊。'
		: '当前账号或服务器不可使用聊天功能。';

	if (room.isJoined) {
		return {
			action: 'none',
			icon: 'ti ti-check',
			text: '已加入',
			primary: false,
			disabled: true,
			notice: null,
		};
	}

	if (room.joinRequestExists) {
		return {
			action: 'cancel-request',
			icon: 'ti ti-x',
			text: '取消申请',
			primary: false,
			disabled: false,
			notice: '入群申请正在处理中。',
		};
	}

	if (room.joinPolicy === 'public') {
		return {
			action: 'join',
			icon: 'ti ti-plus',
			text: '加入群聊',
			primary: true,
			disabled: chatDisabled,
			notice: chatDisabled ? chatUnavailableNotice : null,
		};
	}

	if (room.joinPolicy === 'request_required' && room.allowJoinRequest) {
		return {
			action: 'request',
			icon: 'ti ti-user-plus',
			text: '申请加入',
			primary: true,
			disabled: chatDisabled,
			notice: chatDisabled ? chatUnavailableNotice : null,
		};
	}

	return {
		action: 'none',
		icon: 'ti ti-lock',
		text: room.joinPolicy === 'invite_only' ? '仅邀请加入' : '当前不接受申请',
		primary: false,
		disabled: true,
		notice: room.joinPolicy === 'invite_only' ? '该群仅可通过邀请加入。' : '该群当前不接受入群申请。',
	};
}
