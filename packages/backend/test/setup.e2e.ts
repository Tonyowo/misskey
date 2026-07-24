/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll } from 'vitest';
import { sendEnvResetRequest } from './utils.js';

beforeAll(async () => {
	await sendEnvResetRequest();
});
