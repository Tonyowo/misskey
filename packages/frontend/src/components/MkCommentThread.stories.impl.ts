/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@storybook/vue3';
import { note } from '../../.storybook/fakes.js';
import MkCommentThread from './MkCommentThread.vue';

export const Default = { args: { note: { ...note(), repliesCount: 0 } } } satisfies StoryObj<typeof MkCommentThread>;
export const WithReplies = { args: { note: { ...note(), repliesCount: 3 } } } satisfies StoryObj<typeof MkCommentThread>;
