import { execFile } from 'node:child_process';
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const contractsDir = path.join(repoRoot, 'contracts');
const lesserRoot = path.resolve(repoRoot, '..', 'lesser');
const lesserContractsDir = path.join(lesserRoot, 'docs', 'contracts');

async function pathExists(filePath) {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
	}
}

async function getLesserVersion() {
	const result = { describe: null, sha: null };

	try {
		const { stdout } = await execFileAsync('git', ['-C', lesserRoot, 'describe', '--tags', '--always', '--dirty'], {
			timeout: 10_000,
		});
		result.describe = stdout.trim() || null;
	} catch {
		// best-effort
	}

	try {
		const { stdout } = await execFileAsync('git', ['-C', lesserRoot, 'rev-parse', 'HEAD'], { timeout: 10_000 });
		result.sha = stdout.trim() || null;
	} catch {
		// best-effort
	}

	return result;
}

async function main() {
	if (!(await pathExists(lesserContractsDir))) {
		throw new Error(
			`Could not find Lesser contracts at ${lesserContractsDir}. Expected a sibling checkout at ../lesser.`
		);
	}

	await mkdir(contractsDir, { recursive: true });

	const files = [
		{ from: path.join(lesserContractsDir, 'graphql-schema.graphql'), to: path.join(contractsDir, 'graphql-schema.graphql') },
		{ from: path.join(lesserContractsDir, 'openapi.yaml'), to: path.join(contractsDir, 'openapi.yaml') },
	];

	for (const file of files) {
		if (!(await pathExists(file.from))) {
			throw new Error(`Missing contract source file: ${file.from}`);
		}
		await copyFile(file.from, file.to);
	}

	const lesser = await getLesserVersion();
	await writeFile(
		path.join(contractsDir, 'source.json'),
		JSON.stringify(
			{
				lesserDescribe: lesser.describe,
				lesserSha: lesser.sha,
				sourceDir: path.relative(repoRoot, lesserContractsDir),
			},
			null,
			2
		) + '\n',
		'utf8'
	);

	console.log('Updated contracts from Lesser.');
	console.log(`- Source: ${path.relative(repoRoot, lesserContractsDir)}`);
	console.log(`- Lesser: ${lesser.describe ?? 'unknown'} (${lesser.sha ?? 'unknown'})`);
	console.log(`- Wrote: ${path.relative(repoRoot, contractsDir)}/graphql-schema.graphql`);
	console.log(`- Wrote: ${path.relative(repoRoot, contractsDir)}/openapi.yaml`);
	console.log(`- Wrote: ${path.relative(repoRoot, contractsDir)}/source.json`);
}

await main();
