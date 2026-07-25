/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

interface LocaleRecord {
	[key: string]: string | LocaleRecord;
}

interface ErrorData {
	expected?: string;
	actual?: string;
	parameter?: string;
}

function writeError(type: string, lang: string, tree: string, data: ErrorData): void {
	process.stderr.write(JSON.stringify({ type, lang, tree, data }));
	process.stderr.write('\n');
	process.exitCode = 1;
}

function verify(expected: LocaleRecord, actual: LocaleRecord, lang: string, trace?: string): void {
	for (const key in expected) {
		if (!Object.prototype.hasOwnProperty.call(actual, key)) {
			continue;
		}
		if (typeof expected[key] === 'object') {
			if (typeof actual[key] !== 'object') {
				writeError('mismatched_type', lang, trace ? `${trace}.${key}` : key, { expected: 'object', actual: typeof actual[key] });
				continue;
			}
			verify(expected[key] as LocaleRecord, actual[key] as LocaleRecord, lang, trace ? `${trace}.${key}` : key);
		} else if (typeof expected[key] === 'string') {
			switch (typeof actual[key]) {
				case 'object':
					writeError('mismatched_type', lang, trace ? `${trace}.${key}` : key, { expected: 'string', actual: 'object' });
					break;
				case 'undefined':
					continue;
				case 'string': {
					const expectedParameters = new Set((expected[key] as string).match(/\{[^}]+\}/g)?.map((s) => s.slice(1, -1)));
					const actualParameters = new Set((actual[key] as string).match(/\{[^}]+\}/g)?.map((s) => s.slice(1, -1)));
					for (const parameter of expectedParameters) {
						if (!actualParameters.has(parameter)) {
							writeError('missing_parameter', lang, trace ? `${trace}.${key}` : key, { parameter });
						}
					}
				}
			}
		}
	}
}

function verifyOverrides(expected: LocaleRecord, actual: LocaleRecord, lang: string, trace?: string): void {
	for (const [key, expectedValue] of Object.entries(expected)) {
		const tree = trace ? `${trace}.${key}` : key;
		const actualValue = actual[key];

		if (typeof expectedValue === 'object') {
			if (typeof actualValue !== 'object') {
				writeError('override_mismatch', lang, tree, { expected: 'object', actual: typeof actualValue });
				continue;
			}
			verifyOverrides(expectedValue, actualValue, lang, tree);
		} else if (actualValue !== expectedValue) {
			writeError('override_mismatch', lang, tree, { expected: expectedValue, actual: typeof actualValue === 'string' ? actualValue : typeof actualValue });
		}
	}
}

// index.tsはtsのまま動かすことを想定していない（ビルド成果物を外部に公開する）.
// よってビルド後のものを検証する
const { default: locales } = await import('../built/index.js');
const { customLocaleOverrides } = await import('../built/custom-locale-overrides.js');
const { 'ja-JP': original, ...verifiees } = locales as unknown as Record<string, LocaleRecord>;

for (const lang in verifiees) {
	if (!Object.prototype.hasOwnProperty.call(locales, lang)) {
		continue;
	}
	verify(original, verifiees[lang], lang);
}

for (const [lang, overrides] of Object.entries(customLocaleOverrides)) {
	verifyOverrides(overrides, locales[lang], lang);
}
