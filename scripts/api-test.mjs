import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { EvidenceWriter } from '../tests/api/_harness/evidence.mjs';
import { createGraphQLClient, createRestClient } from '../tests/api/_harness/http.mjs';
import tests from '../tests/api/index.mjs';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
	const args = {
		baseUrl: process.env.API_TEST_BASE_URL ?? null,
		stage: process.env.API_TEST_STAGE ?? process.env.STAGE ?? null,
		profile: process.env.API_TEST_PROFILE ?? 'user',
		filter: null,
		smoke: false,
	};

	for (let i = 2; i < argv.length; i++) {
		const value = argv[i];
		if (value === '--smoke') {
			args.smoke = true;
			continue;
		}
		if (value === '--base-url') {
			args.baseUrl = argv[++i] ?? null;
			continue;
		}
		if (value === '--stage') {
			args.stage = argv[++i] ?? null;
			continue;
		}
		if (value === '--profile') {
			args.profile = argv[++i] ?? null;
			continue;
		}
		if (value === '--filter') {
			args.filter = argv[++i] ?? null;
			continue;
		}
		if (value === '--help' || value === '-h') {
			console.log(`Usage:
  pnpm api:test --base-url <url> --profile <user|delegated|admin> [--stage <stage>] [--smoke] [--filter <slug>]

Env:
  API_TEST_BASE_URL
  API_TEST_PROFILE
  API_TEST_STAGE (or STAGE)
  API_TEST_ACCESS_TOKEN_USER
  API_TEST_ACCESS_TOKEN_DELEGATED
  API_TEST_ACCESS_TOKEN_ADMIN
`);
			process.exit(0);
		}

		throw new Error(`Unknown argument: ${value}`);
	}

	return args;
}

function makeRunId() {
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const rand = Math.random().toString(16).slice(2, 10);
	return `${ts}-${rand}`;
}

async function bestEffortCommand(cmd, args, options) {
	try {
		const { stdout } = await execFileAsync(cmd, args, { timeout: 10_000, ...options });
		return stdout.trim() || null;
	} catch {
		return null;
	}
}

function getAccessToken(profile) {
	const map = {
		user: 'API_TEST_ACCESS_TOKEN_USER',
		delegated: 'API_TEST_ACCESS_TOKEN_DELEGATED',
		admin: 'API_TEST_ACCESS_TOKEN_ADMIN',
	};

	const envName = map[profile];
	if (!envName) throw new Error(`Unknown profile: ${profile}`);
	const token = process.env[envName];
	if (!token) throw new Error(`Missing access token env var: ${envName}`);
	return token;
}

function filterTests(allTests, { smoke, filter }) {
	let selected = allTests;
	if (smoke) selected = selected.filter((t) => Array.isArray(t.tags) && t.tags.includes('smoke'));
	if (filter) {
		const needle = String(filter).toLowerCase();
		selected = selected.filter((t) => t.slug.toLowerCase().includes(needle) || t.name.toLowerCase().includes(needle));
	}
	return selected;
}

async function main() {
	const args = parseArgs(process.argv);
	if (!args.baseUrl) throw new Error('Missing --base-url (or API_TEST_BASE_URL)');

	const profile = args.profile;
	const token = getAccessToken(profile);

	const runId = makeRunId();
	const runDir = path.join(repoRoot, 'artifacts', 'api', runId);
	await mkdir(runDir, { recursive: true });

	const gitSha = await bestEffortCommand('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
	const pnpmVersion = await bestEffortCommand('pnpm', ['-v'], { cwd: repoRoot });

	const evidence = new EvidenceWriter({
		runDir,
		meta: {
			runId,
			startedAt: new Date().toISOString(),
			finishedAt: null,
			baseUrl: args.baseUrl,
			stage: args.stage,
			lesserVersion: null,
			runner: {
				node: process.version,
				pnpm: pnpmVersion,
				gitSha,
			},
			profile,
		},
	});

	await evidence.init();

	const rest = createRestClient({ baseUrl: args.baseUrl, token, evidence });
	const gql = createGraphQLClient({ baseUrl: args.baseUrl, token, evidence });

	const selectedTests = filterTests(tests, { smoke: args.smoke, filter: args.filter });
	if (!selectedTests.length) throw new Error('No tests selected (check --smoke/--filter)');

	let failed = 0;

	try {
		for (const test of selectedTests) {
			evidence.startTest(test);
			try {
				await test.run({ rest, gql, evidence, baseUrl: args.baseUrl, stage: args.stage, profile });
				evidence.recordResult({ slug: test.slug, name: test.name, status: 'passed' });
			} catch (error) {
				failed += 1;
				evidence.recordResult({ slug: test.slug, name: test.name, status: 'failed' });
				await evidence.writeFailure({ test, error });
			} finally {
				evidence.endTest();
			}
		}
	} finally {
		evidence.updateMeta({ finishedAt: new Date().toISOString() });
		await evidence.writeMeta();
		await evidence.writeSummary();
	}

	if (failed) {
		process.exitCode = 1;
		console.error(`API tests failed: ${failed}/${selectedTests.length}. See artifacts/api/${runId}/summary.md`);
	} else {
		console.log(`API tests passed: ${selectedTests.length}/${selectedTests.length}. Artifacts: artifacts/api/${runId}/summary.md`);
	}
}

await main();

