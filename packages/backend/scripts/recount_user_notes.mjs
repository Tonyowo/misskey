/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Default: read-only audit of all local accounts. No credentials or note text are printed.
const args = process.argv.slice(2);
if (args.includes('--help')) {
	console.log('Usage: node scripts/recount_user_notes.mjs [--apply --maintenance]\nDefault: read-only audit of all local user note counts. Applying requires all Misskey server and worker processes to be stopped.');
} else {
	if (args.some(arg => !['--apply', '--maintenance'].includes(arg))) throw new Error('Unknown option. Use --help.');
	const apply = args.includes('--apply');
	if (apply && !args.includes('--maintenance')) throw new Error('Applying requires --maintenance and all Misskey server/worker processes to be stopped.');
	const [{ default: pg }, { loadConfig }, { reconcileUserNoteCounts }] = await Promise.all([
		import('pg'), import('../built/config.js'), import('../built/user-note-count-repair.js'),
	]);
	const config = loadConfig();
	const client = new pg.Client({
		host: config.db.host,
		port: config.db.port,
		user: config.db.user,
		password: config.db.pass,
		database: config.db.db,
		...config.db.extra,
		connectionTimeoutMillis: 5000,
	});
	try {
		await client.connect();
		console.log(JSON.stringify({ applied: apply, ...await reconcileUserNoteCounts(client, { apply }) }, null, 2));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	} finally {
		await client.end();
	}
}
