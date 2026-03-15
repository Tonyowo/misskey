/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type RenderedEmail = {
	subject: string;
	html: string;
	text: string;
};

type RemainingTime = {
	asHours: number;
	asDays: number;
};

function renderEmail(subject: string, htmlLines: string[], textLines: string[]): RenderedEmail {
	return {
		subject,
		html: htmlLines.join('<br>'),
		text: textLines.join('\n'),
	};
}

function buildLinkMail(subject: string, intro: string, link: string): RenderedEmail {
	return renderEmail(subject, [
		intro,
		`<a href="${link}">${link}</a>`,
	], [
		intro,
		link,
	]);
}

function normalizeQuotedHtml(value: string): string {
	return value.trim() === '' ? '-' : value.replace(/\n/g, '<br>');
}

function normalizeQuotedText(value: string): string {
	return value.trim() === '' ? '-' : value;
}

function buildQuotedMail(subject: string, intro: string, quotedHtml: string, quotedText: string): RenderedEmail {
	return renderEmail(subject, [
		intro,
		`<div style="margin-top: 12px; padding: 12px; background: #f7f7f7; border-radius: 8px; white-space: pre-wrap;">${normalizeQuotedHtml(quotedHtml)}</div>`,
	], [
		intro,
		'',
		normalizeQuotedText(quotedText),
	]);
}

function formatRemainingTime(remainingTime: RemainingTime): string {
	return remainingTime.asDays === 0 ? `${remainingTime.asHours} 小时` : `${remainingTime.asDays} 天`;
}

export function createSignupEmail(link: string): RenderedEmail {
	return buildLinkMail(
		'注册确认',
		'请点击下方链接完成注册：',
		link,
	);
}

export function createPasswordResetEmail(link: string, username?: string): RenderedEmail {
	return renderEmail(
		'密码重置请求',
		[
			username ? `账号：@${username}` : '',
			'请点击下方链接重置密码：',
			`<a href="${link}">${link}</a>`,
		].filter(Boolean),
		[
			username ? `账号：@${username}` : '',
			'请点击下方链接重置密码：',
			link,
		].filter(Boolean),
	);
}

export function createEmailVerificationEmail(link: string): RenderedEmail {
	return buildLinkMail(
		'邮箱地址验证',
		'请点击下方链接验证你的邮箱地址：',
		link,
	);
}

export function createNewLoginEmail(): RenderedEmail {
	return renderEmail(
		'新登录提醒',
		[
			'检测到你的账号发生了一次新的登录。',
			'如果这不是你本人操作，请尽快修改密码并检查账号安全设置。',
		],
		[
			'检测到你的账号发生了一次新的登录。',
			'如果这不是你本人操作，请尽快修改密码并检查账号安全设置。',
		],
	);
}

export function createAccountDeletedEmail(): RenderedEmail {
	return renderEmail(
		'账号已删除',
		[
			'你的账号已被删除。',
		],
		[
			'你的账号已被删除。',
		],
	);
}

export function createAbuseReportEmail(commentHtml: string, commentText: string): RenderedEmail {
	return buildQuotedMail(
		'新举报通知',
		'收到一条新的举报，内容如下：',
		commentHtml,
		commentText,
	);
}

export function createModeratorInactivityWarningEmail(remainingTime: RemainingTime): RenderedEmail {
	const timeVariant = formatRemainingTime(remainingTime);
	return renderEmail(
		'版主不活跃警告',
		[
			`检测到有版主在一段时间内没有活动。如果这种状态再持续 ${timeVariant}，站点将切换为邀请制。`,
			'如果你不希望切换为邀请制，请登录 Misskey 并更新最近活动时间。',
		],
		[
			`检测到有版主在一段时间内没有活动。如果这种状态再持续 ${timeVariant}，站点将切换为邀请制。`,
			'如果你不希望切换为邀请制，请登录 Misskey 并更新最近活动时间。',
		],
	);
}

export function createInvitationOnlyChangedEmail(inactivityLimitDays: number): RenderedEmail {
	return renderEmail(
		'站点已切换为邀请制',
		[
			`由于连续 ${inactivityLimitDays} 天未检测到版主活动，站点已切换为邀请制。`,
			'如需取消邀请制，请进入控制面板进行修改。',
		],
		[
			`由于连续 ${inactivityLimitDays} 天未检测到版主活动，站点已切换为邀请制。`,
			'如需取消邀请制，请进入控制面板进行修改。',
		],
	);
}
