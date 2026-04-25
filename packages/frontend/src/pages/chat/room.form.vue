<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	ref="rootEl"
	:class="$style.root"
	:style="{ '--chatKeyboardInset': `${keyboardInset}px` }"
	@dragover.stop="onDragover"
	@drop.stop="onDrop"
>
	<Transition name="fade">
		<div v-if="emojiPickerShown" :class="$style.emojiPanel">
			<div :class="$style.emojiPanelHeader">
				<span>选择表情</span>
				<button class="_button" :class="$style.emojiPanelClose" type="button" @click="closeEmojiPicker({ focusEditor: true })">
					<i class="ti ti-x"></i>
				</button>
			</div>
			<MkEmojiPicker
				ref="emojiPickerEl"
				:class="$style.emojiPicker"
				:showPinned="true"
				:asDrawer="true"
				:max-height="emojiPickerMaxHeight"
				@chosen="onEmojiChosen"
			/>
		</div>
	</Transition>
	<MkPostFormTextEditor
		ref="textEditorEl"
		v-model="text"
		:class="$style.editor"
		class="_acrylic"
		:placeholder="textareaPlaceholder"
		:readonly="textareaReadOnly || isSpeakMuted"
		@focus="onEditorFocus"
		@keydown="onKeydown"
		@paste="onPaste"
	/>
	<footer :class="$style.footer">
		<div v-if="file" :class="$style.file" @click="file = null">{{ file.name }}</div>
		<div :class="$style.buttons">
			<button class="_button" :class="$style.button" @click="chooseFile"><i class="ti ti-photo-plus"></i></button>
			<button class="_button" :class="[$style.button, { [$style.activeButton]: emojiPickerShown }]" @pointerdown="onEmojiButtonPointerDown"><i class="ti ti-mood-happy"></i></button>
			<button class="_button" :class="[$style.button, $style.send]" :disabled="!canSend || sending" :title="sendButtonTitle" @click="send">
				<template v-if="!sending"><i class="ti ti-send"></i></template><template v-if="sending"><MkLoading :em="true"/></template>
			</button>
		</div>
	</footer>
	<input ref="fileEl" style="display: none;" type="file" @change="onChangeFile"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, watch, ref, shallowRef, computed, nextTick, onBeforeUnmount, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { formatTimeString } from '@/utility/format-time-string.js';
import { selectFile } from '@/utility/drive.js';
import * as os from '@/os.js';
import { miLocalStorage } from '@/local-storage.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';
import { Autocomplete } from '@/utility/autocomplete.js';
import { checkDragDataType, getDragData } from '@/drag-and-drop.js';
import MkPostFormTextEditor from '@/components/MkPostFormTextEditor.vue';
import MkEmojiPicker from '@/components/MkEmojiPicker.vue';

const props = defineProps<{
	user?: Misskey.entities.UserDetailed | null;
	room?: Misskey.entities.ChatRoom | null;
}>();

const rootEl = useTemplateRef<HTMLElement>('rootEl');
const textEditorEl = useTemplateRef<InstanceType<typeof MkPostFormTextEditor>>('textEditorEl');
const emojiPickerEl = useTemplateRef<InstanceType<typeof MkEmojiPicker>>('emojiPickerEl');
const fileEl = shallowRef<HTMLInputElement>();

const text = ref<string>('');
const file = ref<Misskey.entities.DriveFile | null>(null);
const sending = ref(false);
const textareaReadOnly = ref(false);
const emojiPickerShown = ref(false);
const keyboardInset = ref(0);
const visualViewportHeight = ref(window.visualViewport?.height ?? window.innerHeight);
let autocompleteInstance: Autocomplete | null = null;
let lastKeyboardScrollHandle = 0;
let viewportUpdateHandles: number[] = [];

const isSpeakMuted = computed(() => props.room?.isSpeakMuted ?? false);
const canSend = computed(() => !isSpeakMuted.value && ((text.value != null && text.value !== '') || file.value != null));
const textareaPlaceholder = computed(() => isSpeakMuted.value ? '你已被禁言，暂时无法发言' : '输入消息');
const sendButtonTitle = computed(() => isSpeakMuted.value ? '你已被禁言，暂时无法发言' : '发送');
const emojiPickerMaxHeight = computed(() => Math.min(260, Math.max(180, Math.round(visualViewportHeight.value * 0.34))));

function getDraftKey() {
	return props.user ? 'user:' + props.user.id : 'room:' + props.room?.id;
}

watch([text, file], saveDraft);
watch(text, () => {
	keepComposerVisible();
});

async function onPaste(ev: ClipboardEvent) {
	if (!ev.clipboardData) return;

	const pastedFileName = 'yyyy-MM-dd HH-mm-ss [{{number}}]';

	const clipboardData = ev.clipboardData;
	const items = clipboardData.items;

	if (items.length === 1) {
		if (items[0].kind === 'file') {
			ev.preventDefault();
			const pastedFile = items[0].getAsFile();
			if (!pastedFile) return;
			const lio = pastedFile.name.lastIndexOf('.');
			const ext = lio >= 0 ? pastedFile.name.slice(lio) : '';
			const formattedName = formatTimeString(new Date(pastedFile.lastModified), pastedFileName).replace(/{{number}}/g, '1') + ext;
			const renamedFile = new File([pastedFile], formattedName, { type: pastedFile.type });
			os.launchUploader([renamedFile], { multiple: false }).then(driveFiles => {
				file.value = driveFiles[0];
			});
		}
	} else {
		if (items[0].kind === 'file') {
			ev.preventDefault();
			os.alert({
				type: 'error',
				text: '只能附加一个文件。',
			});
		}
	}
}

function onDragover(ev: DragEvent) {
	if (!ev.dataTransfer) return;

	const isFile = ev.dataTransfer.items[0].kind === 'file';
	if (isFile || checkDragDataType(ev, ['driveFiles'])) {
		ev.preventDefault();
		switch (ev.dataTransfer.effectAllowed) {
			case 'all':
			case 'uninitialized':
			case 'copy':
			case 'copyLink':
			case 'copyMove':
				ev.dataTransfer.dropEffect = 'copy';
				break;
			case 'linkMove':
			case 'move':
				ev.dataTransfer.dropEffect = 'move';
				break;
			default:
				ev.dataTransfer.dropEffect = 'none';
				break;
		}
	}
}

function onDrop(ev: DragEvent): void {
	if (!ev.dataTransfer) return;

	// ファイルだったら
	if (ev.dataTransfer.files.length === 1) {
		ev.preventDefault();
		os.launchUploader([Array.from(ev.dataTransfer.files)[0]], { multiple: false }).then(driveFiles => {
			file.value = driveFiles[0];
		});
		return;
	} else if (ev.dataTransfer.files.length > 1) {
		ev.preventDefault();
		os.alert({
			type: 'error',
			text: '只能附加一个文件。',
		});
		return;
	}

	//#region ドライブのファイル
	{
		const droppedData = getDragData(ev, 'driveFiles');
		if (droppedData != null) {
			file.value = droppedData[0];
			ev.preventDefault();
		}
	}
	//#endregion
}

function onKeydown(ev: KeyboardEvent) {
	if (ev.key === 'Enter') {
		if (prefer.s['chat.sendOnEnter']) {
			if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
				ev.preventDefault();
				send();
			}
		} else {
			if ((ev.ctrlKey || ev.metaKey)) {
				ev.preventDefault();
				send();
			}
		}
	}
}

function chooseFile(ev: PointerEvent) {
	closeEmojiPicker();
	selectFile({
		anchorElement: ev.currentTarget ?? ev.target,
		multiple: false,
		label: '选择文件',
	}).then(selectedFile => {
		file.value = selectedFile;
	});
}

function onChangeFile() {
	if (fileEl.value == null || fileEl.value.files == null) return;

	if (fileEl.value.files[0]) {
		os.launchUploader(Array.from(fileEl.value.files), { multiple: false }).then(driveFiles => {
			file.value = driveFiles[0];
		});
	}
}

async function send() {
	if (!canSend.value) return;

	closeEmojiPicker();
	sending.value = true;

	try {
		if (props.user) {
			await misskeyApi('chat/messages/create-to-user', {
				toUserId: props.user.id,
				text: text.value ? text.value : undefined,
				fileId: file.value ? file.value.id : undefined,
			});
			clear();
		} else if (props.room) {
			await os.apiWithDialog('chat/messages/create-to-room', {
				toRoomId: props.room.id,
				text: text.value ? text.value : undefined,
				fileId: file.value ? file.value.id : undefined,
			}, undefined, {
				'67512792-fd66-4f82-a4ac-44ec9c75005e': {
					title: '群聊发言',
					text: '你已被禁言，暂时无法发送消息。',
				},
			});
			clear();
		}
	} catch (err) {
		console.error(err);
	} finally {
		sending.value = false;
	}
}

function clear() {
	text.value = '';
	file.value = null;
	closeEmojiPicker();
	deleteDraft();
}

function saveDraft() {
	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	drafts[getDraftKey()] = {
		updatedAt: new Date(),
		data: {
			text: text.value,
			file: file.value,
		},
	};

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
}

function deleteDraft() {
	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	delete drafts[getDraftKey()];

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
}

function getTextSelectionRange() {
	return textEditorEl.value?.getSelectionRange() ?? {
		start: text.value.length,
		end: text.value.length,
	};
}

function insertTextAtSelection(insertedText: string, options?: { focusEditor?: boolean }) {
	const selection = getTextSelectionRange();
	const textBefore = text.value.substring(0, selection.start);
	const textAfter = text.value.substring(selection.end);
	const pos = selection.start + insertedText.length;
	text.value = textBefore + insertedText + textAfter;

	nextTick(() => {
		if (textEditorEl.value) {
			if (options?.focusEditor) {
				textEditorEl.value.focus();
			}
			textEditorEl.value.setSelectionRange(pos, pos);
		}
	});
}

function onEmojiChosen(emoji: string) {
	insertTextAtSelection(emoji);
	keepComposerVisible();
}

function onEmojiButtonPointerDown(ev: PointerEvent) {
	ev.preventDefault();
	ev.stopPropagation();
	preserveTextSelection();
	toggleEmojiPicker();
}

function toggleEmojiPicker() {
	if (emojiPickerShown.value) {
		closeEmojiPicker({ focusEditor: true });
		return;
	}

	preserveTextSelection();
	emojiPickerShown.value = true;
	textareaReadOnly.value = true;
	textEditorEl.value?.blur();
	nextTick(() => {
		emojiPickerEl.value?.reset();
		scheduleViewportAdjustment();
	});
}

function closeEmojiPicker(options?: { focusEditor?: boolean }) {
	if (!emojiPickerShown.value && !textareaReadOnly.value) return;
	emojiPickerShown.value = false;
	textareaReadOnly.value = false;
	if (options?.focusEditor) {
		nextTick(() => {
			textEditorEl.value?.focus();
			scheduleViewportAdjustment();
		});
	}
}

function preserveTextSelection() {
	textEditorEl.value?.rememberSelection();
}

function getKeyboardInset() {
	const visualViewport = window.visualViewport;
	if (visualViewport == null) return 0;

	const inset = window.innerHeight - visualViewport.height - visualViewport.offsetTop;
	return inset > 80 ? Math.round(inset) : 0;
}

function shouldLiftComposer() {
	const activeElement = window.document.activeElement;
	return emojiPickerShown.value || (activeElement != null && (rootEl.value?.contains(activeElement) ?? false));
}

function updateViewportState() {
	visualViewportHeight.value = window.visualViewport?.height ?? window.innerHeight;
	keyboardInset.value = shouldLiftComposer() ? getKeyboardInset() : 0;
}

function clearViewportUpdateHandles() {
	for (const handle of viewportUpdateHandles) {
		window.clearTimeout(handle);
	}
	viewportUpdateHandles = [];
}

function scheduleViewportAdjustment() {
	clearViewportUpdateHandles();
	updateViewportState();
	keepComposerVisible();

	for (const delay of [80, 220, 420]) {
		viewportUpdateHandles.push(window.setTimeout(() => {
			updateViewportState();
			keepComposerVisible();
		}, delay));
	}
}

function keepComposerVisible() {
	window.clearTimeout(lastKeyboardScrollHandle);
	lastKeyboardScrollHandle = window.setTimeout(() => {
		rootEl.value?.scrollIntoView({
			block: 'nearest',
			behavior: 'smooth',
		});
	}, 80);
}

function onEditorFocus() {
	closeEmojiPicker();
	scheduleViewportAdjustment();
}

function onVisualViewportChange() {
	scheduleViewportAdjustment();
}

onMounted(() => {
	if (textEditorEl.value != null) {
		autocompleteInstance = new Autocomplete(textEditorEl.value.getAutocompleteTarget(), text);
	}

	window.visualViewport?.addEventListener('resize', onVisualViewportChange);
	window.visualViewport?.addEventListener('scroll', onVisualViewportChange);

	// 書きかけの投稿を復元
	const draft = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}')[getDraftKey()];
	if (draft) {
		text.value = draft.data.text;
		file.value = draft.data.file;
	}
});

onBeforeUnmount(() => {
	if (autocompleteInstance) {
		autocompleteInstance.detach();
		autocompleteInstance = null;
	}
	clearViewportUpdateHandles();
	window.clearTimeout(lastKeyboardScrollHandle);
	window.visualViewport?.removeEventListener('resize', onVisualViewportChange);
	window.visualViewport?.removeEventListener('scroll', onVisualViewportChange);
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	z-index: 2;
	border-bottom: none;
	border-radius: 14px 14px 0 0;
	overflow: clip;
	background: var(--MI_THEME-panel);
	transform: translateY(calc(-1 * var(--chatKeyboardInset, 0px)));
	transition: transform 0.18s ease;
	will-change: transform;
}

.editor {
	cursor: auto;
	display: block;
	width: 100%;
	min-height: 72px;
	max-height: min(32dvh, 180px);
	margin: 0;
	padding: 14px 16px 8px 16px;
	font-size: 1em;
	font-family: inherit;
	outline: none;
	border: none;
	border-radius: 0;
	box-shadow: none;
	box-sizing: border-box;
	color: var(--MI_THEME-fg);
	overflow-y: auto;
}

.emojiPanel {
	border-bottom: solid 0.5px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}

.emojiPanelHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 12px 6px;
	font-size: 0.85rem;
	font-weight: 700;
	color: color-mix(in srgb, var(--MI_THEME-fg) 72%, transparent);
}

.emojiPanelClose {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border-radius: 999px;
	color: color-mix(in srgb, var(--MI_THEME-fg) 70%, transparent);

	&:hover {
		color: var(--MI_THEME-fg);
		background: var(--MI_THEME-panelHighlight);
	}
}

.emojiPicker {
	width: 100% !important;
	height: min(34dvh, 260px) !important;
	max-height: 260px;
	box-shadow: none;
	border-radius: 0;
	background: var(--MI_THEME-panel);
}

.footer {
	position: sticky;
	bottom: 0;
	background: var(--MI_THEME-panel);
	padding-bottom: max(env(safe-area-inset-bottom, 0px), 0px);
}

.file {
	padding: 8px;
	cursor: pointer;
}

.buttons {
	display: flex;
}

.button {
	height: 50px;
	aspect-ratio: 1;
	border-radius: 10px;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}

.activeButton {
	color: var(--MI_THEME-accent);
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.12);
}

.send {
	margin-left: auto;
	color: var(--MI_THEME-accent);
}
</style>
