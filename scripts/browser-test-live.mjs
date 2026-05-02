import { spawn } from 'node:child_process';

const DEFAULT_TARGETS = [
	'https://dev.simulacrum.greater.website',
	'https://dev.theory.greater.website',
];
const MAX_RETRIES = 1;

function parseTargets(argv) {
	const cliTargets = argv.filter(Boolean);
	if (cliTargets.length > 0) return cliTargets;

	const envTargets = process.env.BROWSER_TEST_LIVE_TARGETS
		?.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
	if (envTargets?.length) return envTargets;

	return DEFAULT_TARGETS;
}

function runIdFor(target) {
	const host = new URL(target).host.replace(/[^a-zA-Z0-9.-]+/g, '-');
	const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/[:]/g, '-');
	return `${host}-${stamp}`;
}

function parseTarget(target) {
	try {
		const parsed = new URL(target);
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
			return { ok: false, error: `unsupported protocol ${parsed.protocol}` };
		}
		return { ok: true, target: parsed.toString().replace(/\/$/, '') };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function runAttempt(target, attempt) {
	return new Promise((resolve) => {
		const runId = `${runIdFor(target)}${attempt > 0 ? `-retry${attempt}` : ''}`;
		console.log(`\n==> Live browser smoke: ${target}`);
		console.log(`    run id: ${runId}`);
		if (attempt > 0) {
			console.log(`    retry: ${attempt}/${MAX_RETRIES}`);
		}

		const child = spawn(
			'pnpm',
			[
				'exec',
				'playwright',
				'test',
				'tests/browser/public-route-live.spec.ts',
				'--project=chromium',
			],
			{
				stdio: 'inherit',
				env: {
					...process.env,
					BROWSER_TEST_BASE_URL: target,
					BROWSER_TEST_RUN_ID: runId,
				},
			}
		);

		child.on('exit', (code, signal) => {
			resolve({
				target,
				runId,
				attempt,
				code: code ?? (signal ? 1 : 0),
				signal: signal ?? null,
			});
		});
	});
}

async function runTarget(target) {
	const parsed = parseTarget(target);
	if (!parsed.ok) {
		console.error(`\n==> Live browser smoke: ${target}`);
		console.error(`    invalid target: ${parsed.error}`);
		return {
			target,
			status: 'invalid',
			attempts: [
				{
					target,
					runId: 'invalid-target',
					attempt: 0,
					code: 1,
					signal: null,
				},
			],
		};
	}

	target = parsed.target;
	const attempts = [];

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
		const result = await runAttempt(target, attempt);
		attempts.push(result);
		if (result.code === 0) {
			return {
				target,
				status: attempt === 0 ? 'passed' : 'flaky',
				attempts,
			};
		}
	}

	return {
		target,
		status: 'failed',
		attempts,
	};
}

const targets = parseTargets(process.argv.slice(2));
const results = [];

for (const target of targets) {
	results.push(await runTarget(target));
}

console.log('\nLive browser smoke summary');
for (const result of results) {
	const lastAttempt = result.attempts[result.attempts.length - 1];
	console.log(
		`- ${
			result.status === 'passed'
				? 'PASS'
				: result.status === 'flaky'
					? 'FLAKY'
					: result.status === 'invalid'
						? 'INVALID'
						: 'FAIL'
		} ${result.target} (${lastAttempt.runId})`
	);
}

const failed = results.find((result) => result.status === 'failed' || result.status === 'invalid');
process.exit(failed ? failed.attempts[failed.attempts.length - 1]?.code ?? 1 : 0);
