/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type SupportedLocale = 'zh' | 'ja' | 'en';

type LocalizedText = Record<SupportedLocale, string>;
type LocalizedTextList = Record<SupportedLocale, string[]>;

type MailSection = {
	label: string;
	htmlLines: string[];
	textLines: string[];
};

export type RenderedEmail = {
	subject: string;
	html: string;
	text: string;
};

type RemainingTime = {
	asHours: number;
	asDays: number;
};

const localeLabels: Record<SupportedLocale, string> = {
	zh: '中文',
	ja: '日本語',
	en: 'English',
};

function renderSubject(subject: LocalizedText): string {
	return `${subject.zh} / ${subject.ja} / ${subject.en}`;
}

function renderSection(section: MailSection): string {
	return [
		'<section style="margin: 0 0 24px 0;">',
		`<p style="margin: 0 0 12px 0; font-weight: 700;">${section.label}</p>`,
		`<div>${section.htmlLines.join('<br>')}</div>`,
		'</section>',
	].join('');
}

function renderEmail(subject: LocalizedText, sections: MailSection[]): RenderedEmail {
	return {
		subject: renderSubject(subject),
		html: sections.map((section, index) => {
			const separator = index < sections.length - 1
				? '<hr style="margin: 24px 0; border: 0; border-top: 1px solid #eee;">'
				: '';
			return renderSection(section) + separator;
		}).join(''),
		text: sections.map(section => {
			return [section.label, ...section.textLines].join('\n');
		}).join('\n\n--------------------\n\n'),
	};
}

function buildSimpleSections(lines: LocalizedTextList): MailSection[] {
	return (['zh', 'ja', 'en'] as const).map(locale => ({
		label: localeLabels[locale],
		htmlLines: lines[locale],
		textLines: lines[locale],
	}));
}

function buildLinkMail(subject: LocalizedText, intro: LocalizedText, link: string): RenderedEmail {
	return renderEmail(subject, (['zh', 'ja', 'en'] as const).map(locale => ({
		label: localeLabels[locale],
		htmlLines: [
			intro[locale],
			`<a href="${link}">${link}</a>`,
		],
		textLines: [
			intro[locale],
			link,
		],
	})));
}

function normalizeQuotedHtml(value: string): string {
	return value.trim() === '' ? '-' : value.replace(/\n/g, '<br>');
}

function normalizeQuotedText(value: string): string {
	return value.trim() === '' ? '-' : value;
}

function buildQuotedMail(subject: LocalizedText, intro: LocalizedText, quotedHtml: string, quotedText: string): RenderedEmail {
	return renderEmail(subject, (['zh', 'ja', 'en'] as const).map(locale => ({
		label: localeLabels[locale],
		htmlLines: [
			intro[locale],
			`<div style="margin-top: 12px; padding: 12px; background: #f7f7f7; border-radius: 8px; white-space: pre-wrap;">${normalizeQuotedHtml(quotedHtml)}</div>`,
		],
		textLines: [
			intro[locale],
			'',
			normalizeQuotedText(quotedText),
		],
	})));
}

function formatRemainingTime(remainingTime: RemainingTime): LocalizedText {
	return {
		zh: remainingTime.asDays === 0 ? `${remainingTime.asHours} 小时` : `${remainingTime.asDays} 天`,
		ja: remainingTime.asDays === 0 ? `${remainingTime.asHours} 時間` : `${remainingTime.asDays} 日間`,
		en: remainingTime.asDays === 0 ? `${remainingTime.asHours} hours` : `${remainingTime.asDays} days`,
	};
}

export function createSignupEmail(link: string): RenderedEmail {
	return buildLinkMail(
		{
			zh: '注册确认',
			ja: 'サインアップ確認',
			en: 'Signup confirmation',
		},
		{
			zh: '请点击下方链接完成注册：',
			ja: '以下のリンクをクリックして登録を完了してください。',
			en: 'Please click the link below to complete your signup:',
		},
		link,
	);
}

export function createPasswordResetEmail(link: string): RenderedEmail {
	return buildLinkMail(
		{
			zh: '密码重置请求',
			ja: 'パスワードリセット申請',
			en: 'Password reset request',
		},
		{
			zh: '请点击下方链接重置密码：',
			ja: '以下のリンクをクリックしてパスワードをリセットしてください。',
			en: 'Please click the link below to reset your password:',
		},
		link,
	);
}

export function createEmailVerificationEmail(link: string): RenderedEmail {
	return buildLinkMail(
		{
			zh: '邮箱地址验证',
			ja: 'メールアドレス確認',
			en: 'Email verification',
		},
		{
			zh: '请点击下方链接验证你的邮箱地址：',
			ja: '以下のリンクをクリックしてメールアドレスを確認してください。',
			en: 'Please click the link below to verify your email address:',
		},
		link,
	);
}

export function createNewLoginEmail(): RenderedEmail {
	return renderEmail(
		{
			zh: '新登录提醒',
			ja: '新しいログイン通知',
			en: 'New login alert',
		},
		buildSimpleSections({
			zh: [
				'检测到你的账号发生了一次新的登录。',
				'如果这不是你本人操作，请尽快修改密码并检查账号安全设置。',
			],
			ja: [
				'あなたのアカウントで新しいログインが検出されました。',
				'心当たりがない場合は、すぐにパスワードを変更し、アカウントのセキュリティ設定を確認してください。',
			],
			en: [
				'A new login to your account was detected.',
				'If this was not you, please change your password and review your account security settings as soon as possible.',
			],
		}),
	);
}

export function createAccountDeletedEmail(): RenderedEmail {
	return renderEmail(
		{
			zh: '账号已删除',
			ja: 'アカウント削除完了',
			en: 'Account deleted',
		},
		buildSimpleSections({
			zh: [
				'你的账号已被删除。',
			],
			ja: [
				'あなたのアカウントは削除されました。',
			],
			en: [
				'Your account has been deleted.',
			],
		}),
	);
}

export function createAbuseReportEmail(commentHtml: string, commentText: string): RenderedEmail {
	return buildQuotedMail(
		{
			zh: '新举报通知',
			ja: '新しい通報',
			en: 'New abuse report',
		},
		{
			zh: '收到一条新的举报，内容如下：',
			ja: '新しい通報を受信しました。内容は以下の通りです。',
			en: 'A new abuse report has been received. Details are below.',
		},
		commentHtml,
		commentText,
	);
}

export function createModeratorInactivityWarningEmail(remainingTime: RemainingTime): RenderedEmail {
	const timeVariant = formatRemainingTime(remainingTime);
	return renderEmail(
		{
			zh: '版主不活跃警告',
			ja: 'モデレーター不在の通知',
			en: 'Moderator inactivity warning',
		},
		buildSimpleSections({
			zh: [
				`检测到有版主在一段时间内没有活动。如果这种状态再持续 ${timeVariant.zh}，站点将切换为邀请制。`,
				'如果你不希望切换为邀请制，请登录 Misskey 并更新最近活动时间。',
			],
			ja: [
				`モデレーターが一定期間活動していないようです。この状態があと ${timeVariant.ja} 続くと、招待制に切り替わります。`,
				'招待制への切り替えを望まない場合は、Misskey にログインして最終アクティブ日時を更新してください。',
			],
			en: [
				`A moderator appears to have been inactive for some time. If this continues for another ${timeVariant.en}, the server will switch to invitation-only mode.`,
				'If you do not want the server to switch to invitation-only mode, please sign in to Misskey and update your last active time.',
			],
		}),
	);
}

export function createInvitationOnlyChangedEmail(inactivityLimitDays: number): RenderedEmail {
	return renderEmail(
		{
			zh: '站点已切换为邀请制',
			ja: '招待制に変更されました',
			en: 'Changed to invitation-only',
		},
		buildSimpleSections({
			zh: [
				`由于连续 ${inactivityLimitDays} 天未检测到版主活动，站点已切换为邀请制。`,
				'如需取消邀请制，请进入控制面板进行修改。',
			],
			ja: [
				`モデレーターの活動が ${inactivityLimitDays} 日間検出されなかったため、招待制に変更されました。`,
				'招待制を解除するには、コントロールパネルにアクセスしてください。',
			],
			en: [
				`The server has been changed to invitation-only mode because no moderator activity was detected for ${inactivityLimitDays} days.`,
				'To disable invitation-only mode, please visit the control panel.',
			],
		}),
	);
}
