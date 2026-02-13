import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { EvidenceWriter } from '../tests/api/_harness/evidence.mjs';
import { createGraphQLClient, createRestClient } from '../tests/api/_harness/http.mjs';
import { createGraphQLContractValidator } from '../tests/api/_harness/graphql-contract.mjs';
import { createOpenApiValidator } from '../tests/api/_harness/openapi.mjs';
import { SkipTestError } from '../tests/api/_harness/skip.mjs';
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
		unsafe: false,
	};

	for (let i = 2; i < argv.length; i++) {
		const value = argv[i];
		if (value === '--smoke') {
			args.smoke = true;
			continue;
		}
		if (value === '--unsafe') {
			args.unsafe = true;
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
  pnpm api:test --base-url <url> --profile <user|delegated|admin> [--stage <stage>] [--smoke] [--filter <slug>] [--unsafe]

Env:
  API_TEST_BASE_URL
  API_TEST_PROFILE
  API_TEST_STAGE (or STAGE)
  API_TEST_ACCESS_TOKEN_USER
  API_TEST_ACCESS_TOKEN_DELEGATED
  API_TEST_ACCESS_TOKEN_ADMIN
  API_TEST_REFRESH_TOKEN_USER (optional; only used with --unsafe tests)
  API_TEST_REFRESH_TOKEN_DELEGATED (optional; only used with --unsafe tests)
  API_TEST_REFRESH_TOKEN_ADMIN (optional; only used with --unsafe tests)
  API_TEST_OAUTH_CLIENT_ID (optional; auto-detected from JWT when possible)
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
	return process.env[envName] ?? null;
}

function getRefreshToken(profile) {
	const map = {
		user: 'API_TEST_REFRESH_TOKEN_USER',
		delegated: 'API_TEST_REFRESH_TOKEN_DELEGATED',
		admin: 'API_TEST_REFRESH_TOKEN_ADMIN',
	};

	const envName = map[profile];
	if (!envName) throw new Error(`Unknown profile: ${profile}`);
	return process.env[envName] ?? null;
}

function base64UrlDecode(input) {
	const value = input.replace(/-/g, '+').replace(/_/g, '/');
	const padLen = (4 - (value.length % 4)) % 4;
	const padded = value + '='.repeat(padLen);
	return Buffer.from(padded, 'base64').toString('utf8');
}

function tryParseJwtPayload(token) {
	if (typeof token !== 'string') return null;
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	try {
		return JSON.parse(base64UrlDecode(parts[1]));
	} catch {
		return null;
	}
}

function getOAuthClientId(accessToken) {
	const fromEnv = process.env.API_TEST_OAUTH_CLIENT_ID;
	if (fromEnv) return fromEnv;

	const payload = tryParseJwtPayload(accessToken);
	return typeof payload?.client_id === 'string' ? payload.client_id : null;
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
	const selectedTests = filterTests(tests, { smoke: args.smoke, filter: args.filter });
	if (!selectedTests.length) throw new Error('No tests selected (check --smoke/--filter)');

	const needsAuth = selectedTests.some((t) => t.requiresAuth);

	const token = getAccessToken(profile);
	if (needsAuth && !token) {
		const envName =
			profile === 'user'
				? 'API_TEST_ACCESS_TOKEN_USER'
				: profile === 'delegated'
					? 'API_TEST_ACCESS_TOKEN_DELEGATED'
					: profile === 'admin'
						? 'API_TEST_ACCESS_TOKEN_ADMIN'
						: null;
		throw new Error(envName ? `Missing access token env var: ${envName}` : `Missing access token for profile: ${profile}`);
	}

	const refreshToken = getRefreshToken(profile);
	const clientId = token ? getOAuthClientId(token) : null;

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
			unsafe: args.unsafe,
		},
	});

	await evidence.init();

	const openapi = await createOpenApiValidator({ specPath: path.join(repoRoot, 'contracts', 'openapi.yaml') });
	const graphqlContract = await createGraphQLContractValidator({
		schemaPath: path.join(repoRoot, 'contracts', 'graphql-schema.graphql'),
	});

	const rest = createRestClient({ baseUrl: args.baseUrl, token, evidence, openapi });
	const gql = createGraphQLClient({ baseUrl: args.baseUrl, token, evidence, contract: graphqlContract });
	const tokens = { accessToken: token, refreshToken, clientId };

	let failed = 0;

	try {
		for (const test of selectedTests) {
			evidence.startTest(test);
			try {
				await test.run({
					rest,
					gql,
					evidence,
					openapi,
					graphqlContract,
					baseUrl: args.baseUrl,
					stage: args.stage,
					profile,
					tokens,
					unsafe: args.unsafe,
				});
				evidence.recordResult({ slug: test.slug, name: test.name, status: 'passed' });
			} catch (error) {
				if (error instanceof SkipTestError || error?.name === 'SkipTestError') {
					evidence.recordResult({
						slug: test.slug,
						name: test.name,
						status: 'skipped',
						reason: error?.message ?? 'skipped',
					});
				} else {
					failed += 1;
					evidence.recordResult({ slug: test.slug, name: test.name, status: 'failed' });
					await evidence.writeFailure({ test, error });
				}
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
