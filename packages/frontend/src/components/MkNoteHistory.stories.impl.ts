/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@storybook/vue3';
import MkNoteHistory from './MkNoteHistory.vue';

export const Default = { args: { noteId: 'somenoteid' } } satisfies StoryObj<typeof MkNoteHistory>;
