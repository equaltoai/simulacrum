import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function walk(dir) {
	const entries = await readdir(dir);
	const results = [];

	for (const name of entries) {
		const fullPath = path.join(dir, name);
		const entryStat = await stat(fullPath);

		if (entryStat.isDirectory()) {
			results.push(...(await walk(fullPath)));
			continue;
		}

		results.push(fullPath);
	}

	return results;
}

const distDir = process.argv[2] ?? 'dist';
const immutableDir = path.join(distDir, '_assets', 'immutable');

const announcerStyle = String.raw`style="position: absolute; left: 0; top: 0; clip: rect(0 0 0 0); clip-path: inset(50%); overflow: hidden; white-space: nowrap; width: 1px; height: 1px"`;
const announcerStyleRegex = new RegExp(
	String.raw`(id="svelte-announcer"[^>]*?)\s+${announcerStyle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
	'g'
);

let patchedFiles = 0;

for (const filePath of await walk(immutableDir)) {
	if (!filePath.endsWith('.js')) continue;

	const original = await readFile(filePath, 'utf8');
	if (!original.includes('id="svelte-announcer"')) continue;

	const updated = original.replace(announcerStyleRegex, '$1');
	if (updated === original) continue;

	await writeFile(filePath, updated, 'utf8');
	patchedFiles += 1;
}

if (patchedFiles === 0) {
	throw new Error(
		`externalize-sveltekit-announcer: no files patched under ${immutableDir}; ` +
			`SvelteKit announcer markup may have changed`
	);
}

console.log(`externalize-sveltekit-announcer: removed inline style from svelte-announcer in ${patchedFiles} file(s)`);

