import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function usage() {
	return [
		'Usage:',
		'  node scripts/render-install-manifest.mjs \\',
		'    --app <slug> \\',
		'    [--display-name <name>] \\',
		'    [--template <path>] \\',
		'    [--out <path>]',
		'',
		'Defaults:',
		'  --template ./facetheory.lesser.json',
		'  --out ./facetheory.<app>.lesser.json',
		'',
	].join('\n');
}

function readArgValue(args, name) {
	const index = args.indexOf(name);
	if (index === -1) return null;
	const value = args[index + 1];
	if (!value || value.startsWith('--')) {
		throw new Error(`Missing value for ${name}`);
	}
	return value;
}

function toDisplayName(app) {
	return app
		.split(/[-_]/g)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
	console.log(usage());
	process.exit(0);
}

const appName = readArgValue(args, '--app');
const displayName = readArgValue(args, '--display-name');
const templatePath = path.resolve(readArgValue(args, '--template') ?? 'facetheory.lesser.json');
const outPath = path.resolve(readArgValue(args, '--out') ?? `facetheory.${appName ?? 'app'}.lesser.json`);

if (!appName) {
	console.error(usage());
	process.exit(1);
}

const templateRaw = await readFile(templatePath, 'utf8');
const manifest = JSON.parse(templateRaw);

manifest.app_name = appName;
manifest.display_name = displayName ?? toDisplayName(appName);

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(manifest, null, '\t')}\n`, 'utf8');

console.log(`render-install-manifest: wrote ${outPath}`);
