/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import pg from 'pg';
import { loadConfig } from '../built/config.js';

// Use a raw client and a read-only transaction: ORM test mode can synchronize/drop schemas.
const config = loadConfig();
const client = new pg.Client({
	host: config.db.host,
	port: config.db.port,
	user: config.db.user,
	password: config.db.pass,
	database: config.db.db,
	...config.db.extra,
});

try {
	await client.connect();
	await client.query('BEGIN READ ONLY');
	const { rows } = await client.query(`
		SELECT array_agg(profile."userId" ORDER BY profile."userId") AS "userIds"
		FROM user_profile profile JOIN "user" account ON account.id = profile."userId"
		WHERE account.host IS NULL AND profile."emailVerified" = true AND profile.email IS NOT NULL
		GROUP BY LOWER(TRIM(profile.email)) HAVING count(*) > 1
	`);
	await client.query('COMMIT');
	// Account IDs support remediation without printing addresses or credentials.
	console.log(JSON.stringify({
		collisionGroups: rows.length,
		affectedAccounts: rows.reduce((count, row) => count + row.userIds.length, 0),
		groups: rows,
	}, null, 2));
	process.exitCode = rows.length ? 1 : 0;
} finally {
	await client.end();
}
