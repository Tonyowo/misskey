/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';

type UserLike = Pick<Misskey.entities.UserLite, 'username'> & {
	name?: string | null;
};

type ChatSystemEventLike = {
	type: string;
	targetUser?: UserLike | null;
	targetUserId?: string | null;
	expiresAt?: string | null;
	reason?: string | null;
	permissions?: string[] | null;
	messageId?: string | null;
};

type ChatMessageLike = {
	type?: string | null;
	text?: string | null;
	fileId?: string | null;
	fromUser?: UserLike | null;
	systemEvent?: ChatSystemEventLike | null;
};

const adminPermissionLabels: Record<string, string> = {
	invite: '邀请成员',
	approve: '审批申请',
	kick: '移出成员',
	ban: '封禁成员',
	mute: '禁言成员',
	announcement: '管理公告',
	pin: '置顶消息',
};

function getUserDisplayName(user?: UserLike | null): string {
	if (user == null) return '系统';
	return user.name?.trim() || `@${user.username}`;
}

function formatDateTime(dateTime: string | null | undefined): string {
	if (dateTime == null) return '';
	const date = new Date(dateTime);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleString('zh-CN', {
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function formatExpiresAt(dateTime: string | null | undefined): string {
	const formatted = formatDateTime(dateTime);
	return formatted ? `，截止至 ${formatted}` : '';
}

function formatReason(reason: string | null | undefined): string {
	const text = reason?.trim();
	return text ? `，原因：${text}` : '';
}

function formatAdminPermissions(permissions: string[] | null | undefined): string {
	if (permissions == null || permissions.length === 0) {
		return '未分配具体权限';
	}

	return permissions.map(permission => adminPermissionLabels[permission] ?? permission).join('、');
}

export function isSystemChatMessage(message: ChatMessageLike): boolean {
	return message.type === 'system' && message.systemEvent != null;
}

export function formatChatSystemEventText(message: ChatMessageLike): string {
	const systemEvent = message.systemEvent;
	if (message.type !== 'system' || systemEvent == null) {
		return message.text?.trim() ?? '';
	}

	const actor = getUserDisplayName(message.fromUser);
	const target = getUserDisplayName(systemEvent.targetUser);

	switch (systemEvent.type) {
		case 'member_joined':
			return `${actor} 加入了群聊`;
		case 'member_left':
			return `${actor} 退出了群聊`;
		case 'invitation_created':
			return systemEvent.targetUserId != null ? `${actor} 邀请了 ${target}` : `${actor} 创建了邀请链接`;
		case 'join_request_accepted':
			return `${actor} 通过了 ${target} 的入群申请`;
		case 'member_kicked':
			return `${actor} 移出了 ${target}`;
		case 'member_banned':
			return `${actor} 封禁了 ${target}${formatExpiresAt(systemEvent.expiresAt)}${formatReason(systemEvent.reason)}`;
		case 'member_unbanned':
			return `${actor} 解除了 ${target} 的封禁`;
		case 'member_muted':
			return `${actor} 禁言了 ${target}${formatExpiresAt(systemEvent.expiresAt)}${formatReason(systemEvent.reason)}`;
		case 'member_unmuted':
			return `${actor} 解除了 ${target} 的禁言`;
		case 'member_promoted':
			return `${actor} 将 ${target} 设为管理员`;
		case 'member_demoted':
			return `${actor} 取消了 ${target} 的管理员身份`;
		case 'owner_transferred':
			return `${actor} 将群主转让给了 ${target}`;
		case 'announcement_updated':
			return `${actor} 更新了群公告`;
		case 'message_pinned':
			return `${actor} 置顶了一条消息`;
		case 'message_unpinned':
			return `${actor} 取消了置顶消息`;
		case 'admin_permissions_updated':
			return `${actor} 更新了管理员权限：${formatAdminPermissions(systemEvent.permissions)}`;
		default:
			return `${actor} 更新了群聊状态`;
	}
}

export function formatChatMessagePreviewText(message: ChatMessageLike): string {
	if (isSystemChatMessage(message)) {
		return formatChatSystemEventText(message);
	}

	const text = message.text?.trim();
	if (text) return text;
	if (message.fileId != null) return '发送了一个文件';
	return '暂无内容';
}
