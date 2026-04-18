import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

function hashContent(value) {
	return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function findCaseInsensitiveIndex(haystack, needle, fromIndex = 0) {
	return haystack.toLowerCase().indexOf(needle.toLowerCase(), fromIndex);
}

function isTagNameBoundary(character) {
	return !character || /\s|\/|>/.test(character);
}

function hasSrcAttribute(openTag) {
	return /\bsrc\s*=/.test(openTag);
}

function findBootstrapScript(html) {
	let searchIndex = 0;
	while (searchIndex < html.length) {
		const scriptIndex = findCaseInsensitiveIndex(html, '<script', searchIndex);
		if (scriptIndex < 0) break;
		const tagNameEnd = scriptIndex + '<script'.length;
		if (!isTagNameBoundary(html[tagNameEnd])) {
			searchIndex = tagNameEnd;
			continue;
		}

		const openTagEnd = html.indexOf('>', tagNameEnd);
		if (openTagEnd < 0) break;

		const closeTagStart = findCaseInsensitiveIndex(html, '</script', openTagEnd + 1);
		if (closeTagStart < 0) break;

		const closeTagEnd = html.indexOf('>', closeTagStart + '</script'.length);
		if (closeTagEnd < 0) break;

		const fullMatch = html.slice(scriptIndex, closeTagEnd + 1);
		const content = html.slice(openTagEnd + 1, closeTagStart);
		if (content.includes('__sveltekit_')) {
			return {
				fullMatch,
				content,
				index: scriptIndex,
			};
		}

		searchIndex = closeTagEnd + 1;
	}
	return null;
}

function hasInlineScripts(html) {
	let searchIndex = 0;
	while (searchIndex < html.length) {
		const scriptIndex = findCaseInsensitiveIndex(html, '<script', searchIndex);
		if (scriptIndex < 0) return false;

		const tagNameEnd = scriptIndex + '<script'.length;
		if (!isTagNameBoundary(html[tagNameEnd])) {
			searchIndex = tagNameEnd;
			continue;
		}

		const openTagEnd = html.indexOf('>', tagNameEnd);
		if (openTagEnd < 0) return false;

		const openTag = html.slice(scriptIndex, openTagEnd + 1);
		if (!hasSrcAttribute(openTag)) return true;

		searchIndex = openTagEnd + 1;
	}
	return false;
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
