import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

function hashContent(value) {
	return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function findBootstrapScript(html) {
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
	for (const match of scripts) {
		if (match[1]?.includes('__sveltekit_')) {
			return {
				fullMatch: match[0],
				content: match[1],
				index: match.index ?? -1,
			};
		}
	}
	return null;
}

function hasInlineScripts(html) {
	const tags = [...html.matchAll(/<script\b([^>]*)>/g)];
	return tags.some((match) => !/\bsrc\s*=/.test(match[1] ?? ''));
}

async function deleteOldBootstraps(assetsDir) {
	let entries = [];
	try {
		entries = await readdir(assetsDir);
	} catch {
		return;
	}

	await Promise.all(
		entries
			.filter((name) => name.startsWith('bootstrap.') && name.endsWith('.js'))
			.map((name) => rm(path.join(assetsDir, name), { force: true }))
	);
}

const distDir = process.argv[2] ?? 'dist';
const indexPath = path.join(distDir, 'index.html');
const indexHtml = await readFile(indexPath, 'utf8');

const bootstrap = findBootstrapScript(indexHtml);
if (!bootstrap) {
	throw new Error(`No SvelteKit bootstrap script found in ${indexPath}`);
}

const scriptBody = bootstrap.content.trim();
const contentHash = hashContent(scriptBody);
const assetsDir = path.join(distDir, '_assets');
const fileName = `bootstrap.${contentHash}.js`;
const filePath = path.join(assetsDir, fileName);

await mkdir(assetsDir, { recursive: true });
await deleteOldBootstraps(assetsDir);
await writeFile(filePath, `${scriptBody}\n`, { encoding: 'utf8' });

const replacement = `<script src="/l/_assets/${fileName}"></script>`;
const updatedHtml =
	bootstrap.index >= 0
		? indexHtml.slice(0, bootstrap.index) +
			replacement +
			indexHtml.slice(bootstrap.index + bootstrap.fullMatch.length)
		: indexHtml.replace(bootstrap.fullMatch, replacement);

if (hasInlineScripts(updatedHtml)) {
	throw new Error(`Inline <script> tags remain in ${indexPath} after externalizing bootstrap`);
}

await writeFile(indexPath, updatedHtml, { encoding: 'utf8' });
console.log(`externalize-sveltekit-bootstrap: wrote _assets/${fileName}`);

