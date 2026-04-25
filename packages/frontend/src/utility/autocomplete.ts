/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { nextTick, ref, defineAsyncComponent } from 'vue';
import getCaretCoordinates from 'textarea-caret';
import { toASCII } from 'punycode.js';
import type { Ref } from 'vue';
import type { CompleteInfo } from '@/components/MkAutocomplete.vue';
import { popup } from '@/os.js';

export type SuggestionType = 'user' | 'hashtag' | 'emoji' | 'mfmTag' | 'mfmParam';
export type AutocompleteOptions = {
	chatRoomId?: string;
	includeMentionAll?: boolean;
};
export type AutocompleteTarget = {
	value: string;
	selectionStart: number | null;
	selectionEnd: number | null;
	scrollLeft: number;
	scrollTop: number;
	addEventListener: HTMLElement['addEventListener'];
	removeEventListener: HTMLElement['removeEventListener'];
	getBoundingClientRect: HTMLElement['getBoundingClientRect'];
	focus: () => void;
	setSelectionRange: (start: number, end: number) => void;
	applyTextUpdate?: (value: string, selectionStart: number, selectionEnd?: number) => void;
	getCaretCoordinates?: () => { left: number; top: number };
};

type CompleteProps<T extends keyof CompleteInfo> = {
	type: T;
	value: CompleteInfo[T]['payload'];
};

type CompletionRange = {
	start: number;
	end: number;
};
type PopupCompleteType = Exclude<keyof CompleteInfo, 'mentionAll'>;

function isCompleteType<T extends keyof CompleteInfo>(expectedType: T, props: CompleteProps<keyof CompleteInfo>): props is CompleteProps<T> {
	return props.type === expectedType;
}

export class Autocomplete {
	private suggestion: {
		x: Ref<number>;
		y: Ref<number>;
		q: Ref<any>;
		close: () => void;
	} | null;
	private textarea: AutocompleteTarget;
	private currentType: PopupCompleteType | undefined;
	private currentRange: CompletionRange | null;
	private textRef: Ref<string | number | null>;
	private opening: boolean;
	private onlyType: SuggestionType[];
	private options: AutocompleteOptions;

	private get text(): string {
		// Use raw .value to get the latest value
		// (Because v-model does not update while composition)
		return this.textarea.value;
	}

	private set text(text: string) {
		// Use ref value to notify other watchers
		// (Because .value setter never fires input/change events)
		this.textRef.value = text;
	}

	/**
	 * 対象のテキストエリアを与えてインスタンスを初期化します。
	 */
	constructor(textarea: AutocompleteTarget, textRef: Ref<string | number | null>, onlyType?: SuggestionType[], options?: AutocompleteOptions) {
		//#region BIND
		this.onInput = this.onInput.bind(this);
		this.complete = this.complete.bind(this);
		this.close = this.close.bind(this);
		//#endregion

		this.suggestion = null;
		this.textarea = textarea;
		this.currentRange = null;
		this.textRef = textRef;
		this.opening = false;
		this.onlyType = onlyType ?? ['user', 'hashtag', 'emoji', 'mfmTag', 'mfmParam'];
		this.options = options ?? {};

		this.attach();
	}

	/**
	 * このインスタンスにあるテキストエリアの入力のキャプチャを開始します。
	 */
	public attach() {
		this.textarea.addEventListener('input', this.onInput);
	}

	/**
	 * このインスタンスにあるテキストエリアの入力のキャプチャを解除します。
	 */
	public detach() {
		this.textarea.removeEventListener('input', this.onInput);
		this.close();
	}

	/**
	 * テキスト入力時
	 */
	private onInput() {
		const caretPos = Number(this.textarea.selectionStart);
		const beforeCaret = this.text.substring(0, caretPos);
		const lineStart = beforeCaret.lastIndexOf('\n') + 1;
		const text = beforeCaret.substring(lineStart);

		// メンションに含められる文字のみで構成された、最も末尾にある文字列を抽出
		const mentionCandidate = text.split(/[^a-zA-Z0-9_@.\-]+/).pop()!;
		const mentionCandidateStart = text.length - mentionCandidate.length;

		const mentionIndex = mentionCandidate.lastIndexOf('@');
		const hashtagIndex = text.lastIndexOf('#');
		const emojiIndex = text.lastIndexOf(':');
		const mfmTagIndex = text.lastIndexOf('$');
		const mfmParamIndex = text.lastIndexOf('.');

		const max = Math.max(
			mentionIndex,
			hashtagIndex,
			emojiIndex,
			mfmTagIndex);

		if (max === -1) {
			this.close();
			return;
		}

		const afterLastMfmParam = text.split(/\$\[[a-zA-Z]+/).pop();

		const maybeMention = mentionIndex !== -1;
		const isHashtag = hashtagIndex !== -1;
		const isMfmParam = mfmParamIndex !== -1 && afterLastMfmParam?.includes('.') && !afterLastMfmParam.includes(' ');
		const isMfmTag = mfmTagIndex !== -1 && !isMfmParam;
		const isEmoji = emojiIndex !== -1 && text.split(/:[a-z0-9_+\-]+:/).pop()!.includes(':');
		// :ok:などを🆗にするたいおぷ
		const isEmojiCompleteToUnicode = !isEmoji && emojiIndex === text.length - 1;

		let opened = false;

		if (maybeMention && this.onlyType.includes('user')) {
			// ユーザのサジェスト中に@を入力すると、その位置から新たにユーザ名を取りなおそうとしてしまう
			// この動きはリモートユーザのサジェストを阻害するので、@を検知したらその位置よりも前の@を探し、
			// ホスト名を含むリモートのユーザ名を全て拾えるようにする
			const mentionIndexAlt = mentionCandidate.lastIndexOf('@', mentionIndex - 1);

			// @が連続している場合、1つ目を無視する
			const mentionIndexLeft = (mentionIndexAlt !== -1 && mentionIndexAlt !== mentionIndex - 1) ? mentionIndexAlt : mentionIndex;

			// メンションを構成する条件を満たしているか確認する
			const isMention = mentionIndexLeft === 0 || '_@.-'.includes(mentionCandidate[mentionIndexLeft - 1]);

			if (isMention) {
				const username = mentionCandidate.substring(mentionIndexLeft + 1);
				if (username !== '' && username.match(/^[a-zA-Z0-9_@.\-]+$/)) {
					this.open('user', username, {
						start: lineStart + mentionCandidateStart + mentionIndexLeft,
						end: caretPos,
					});
					opened = true;
				} else if (username === '') {
					this.open('user', null, {
						start: lineStart + mentionCandidateStart + mentionIndexLeft,
						end: caretPos,
					});
					opened = true;
				}
			}
		}

		if (isHashtag && !opened && this.onlyType.includes('hashtag')) {
			const hashtag = text.substring(hashtagIndex + 1);
			if (!hashtag.includes(' ')) {
				this.open('hashtag', hashtag, {
					start: lineStart + hashtagIndex,
					end: caretPos,
				});
				opened = true;
			}
		}

		if (isEmoji && !opened && this.onlyType.includes('emoji')) {
			const emoji = text.substring(emojiIndex + 1);
			if (!emoji.includes(' ')) {
				this.open('emoji', emoji, {
					start: lineStart + emojiIndex,
					end: caretPos,
				});
				opened = true;
			}
		}

		if (isEmojiCompleteToUnicode && !opened && this.onlyType.includes('emoji')) {
			const emojiStartIndex = text.lastIndexOf(':', text.length - 2);
			const emoji = text.substring(emojiStartIndex + 1, text.length - 1);
			if (!emoji.includes(' ')) {
				this.open('emojiComplete', emoji, {
					start: lineStart + emojiStartIndex,
					end: caretPos,
				});
				opened = true;
			}
		}

		if (isMfmTag && !opened && this.onlyType.includes('mfmTag')) {
			const mfmTag = text.substring(mfmTagIndex + 1);
			if (!mfmTag.includes(' ')) {
				this.open('mfmTag', mfmTag.replace('[', ''), {
					start: lineStart + mfmTagIndex,
					end: caretPos,
				});
				opened = true;
			}
		}

		if (isMfmParam && !opened && this.onlyType.includes('mfmParam')) {
			const mfmParam = text.substring(mfmParamIndex + 1);
			if (!mfmParam.includes(' ')) {
				this.open('mfmParam', {
					tag: text.substring(mfmTagIndex + 2, mfmParamIndex),
					params: mfmParam.split(','),
				}, {
					start: lineStart + mfmParamIndex,
					end: caretPos,
				});
				opened = true;
			}
		}

		if (!opened) {
			this.close();
		}
	}

	/**
	 * サジェストを提示します。
	 */
	private async open<T extends PopupCompleteType>(type: T, q: CompleteInfo[T]['query'], range: CompletionRange) {
		if (type !== this.currentType) {
			this.close();
		}
		if (this.opening) return;
		this.opening = true;
		this.currentType = type;
		this.currentRange = range;

		//#region サジェストを表示すべき位置を計算
		const caretPosition = this.textarea.getCaretCoordinates?.() ?? getCaretCoordinates(this.textarea as HTMLInputElement | HTMLTextAreaElement, this.textarea.selectionStart ?? 0);

		const rect = this.textarea.getBoundingClientRect();

		const x = rect.left + caretPosition.left - this.textarea.scrollLeft;
		const y = rect.top + caretPosition.top - this.textarea.scrollTop;
		//#endregion

		if (this.suggestion) {
			this.suggestion.x.value = x;
			this.suggestion.y.value = y;
			this.suggestion.q.value = q;

			this.opening = false;
		} else {
			const _x = ref(x);
			const _y = ref(y);
			const _q = ref(q);

			const { dispose } = popup(defineAsyncComponent(() => import('@/components/MkAutocomplete.vue')), {
				textarea: this.textarea,
				close: this.close,
				type: type,
				//@ts-expect-error popupは今のところジェネリック型のコンポーネントに対応していない
				q: _q,
				chatRoomId: this.options.chatRoomId,
				includeMentionAll: this.options.includeMentionAll,
				x: _x,
				y: _y,
			}, {
				done: (res) => {
					this.complete(res);
				},
			});

			this.suggestion = {
				q: _q,
				x: _x,
				y: _y,
				close: () => dispose(),
			};

			this.opening = false;
		}
	}

	/**
	 * サジェストを閉じます。
	 */
	private close(focus = true) {
		if (this.suggestion == null) return;

		this.suggestion.close();
		this.suggestion = null;
		this.currentRange = null;

		if (focus) {
			this.textarea.focus();
		}
	}

	private applyCompletionText(text: string, caret: number) {
		if (this.textarea.applyTextUpdate) {
			this.textarea.applyTextUpdate(text, caret, caret);
			return;
		}

		this.text = text;
		nextTick(() => {
			this.textarea.focus();
			this.textarea.setSelectionRange(caret, caret);
		});
	}

	/**
	 * オートコンプリートする
	 */
	private complete<T extends keyof CompleteInfo>(props: CompleteProps<T>) {
		const range = this.currentRange ?? {
			start: Number(this.textarea.selectionStart),
			end: Number(this.textarea.selectionStart),
		};
		this.close(false);

		if (isCompleteType('user', props)) {
			const source = this.text;

			const before = source.substring(0, range.start);
			const after = source.substring(range.end);

			const acct = props.value.host === null ? props.value.username : `${props.value.username}@${toASCII(props.value.host)}`;

			// 挿入
			const completedText = `${before}@${acct} ${after}`;
			const pos = before.length + (acct.length + 2);
			this.applyCompletionText(completedText, pos);
		} else if (isCompleteType('mentionAll', props)) {
			const source = this.text;

			const before = source.substring(0, range.start);
			const after = source.substring(range.end);

			const completedText = `${before}@全体成员 ${after}`;
			const pos = before.length + '@全体成员 '.length;
			this.applyCompletionText(completedText, pos);
		} else if (isCompleteType('hashtag', props)) {
			const source = this.text;

			const before = source.substring(0, range.start);
			const after = source.substring(range.end);

			// 挿入
			const completedText = `${before}#${props.value} ${after}`;
			const pos = before.length + (props.value.length + 2);
			this.applyCompletionText(completedText, pos);
		} else if (isCompleteType('emoji', props)) {
			const source = this.text;

			const before = source.substring(0, range.start);
			const after = source.substring(range.end);

			// 挿入
			const completedText = before + props.value + after;
			const pos = before.length + props.value.length;
			this.applyCompletionText(completedText, pos);
		} else if (isCompleteType('emojiComplete', props)) {
			const source = this.text;

			const before = source.substring(0, range.start);
			const after = source.substring(range.end);

			// 挿入
			const completedText = before + props.value + after;
			const pos = before.length + props.value.length;
			this.applyCompletionText(completedText, pos);
		} else if (isCompleteType('mfmTag', props)) {
			const source = this.text;

			const before = source.substring(0, range.start);
			const after = source.substring(range.end);

			// 挿入
			const completedText = `${before}$[${props.value} ]${after}`;
			const pos = before.length + (props.value.length + 3);
			this.applyCompletionText(completedText, pos);
		} else if (isCompleteType('mfmParam', props)) {
			const source = this.text;

			const before = source.substring(0, range.start);
			const after = source.substring(range.end);

			// 挿入
			const completedText = `${before}.${props.value}${after}`;
			const pos = before.length + (props.value.length + 1);
			this.applyCompletionText(completedText, pos);
		}
	}
}
