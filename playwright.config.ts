import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

function buildRunId(): string {
	const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
	return stamp.replace(/[:]/g, '-');
}

const runId = process.env.BROWSER_TEST_RUN_ID ?? buildRunId();
const artifactsDir = process.env.BROWSER_TEST_ARTIFACTS_DIR ?? path.join('artifacts', 'browser', runId);
const baseURL = process.env.BROWSER_TEST_BASE_URL ?? 'http://127.0.0.1:4173';
const useManagedServer = !process.env.BROWSER_TEST_BASE_URL;

export default defineConfig({
	testDir: './tests/browser',
	fullyParallel: true,
	timeout: 30_000,
	expect: {
		timeout: 10_000,
	},
	reporter: [
		['list'],
		['./tests/browser/_harness/reporter.ts', { artifactsDir, runId }],
	],
	outputDir: path.join(artifactsDir, 'test-results'),
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		ignoreHTTPSErrors: true,
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
			},
		},
	],
	webServer: useManagedServer
		? {
				command: 'pnpm dev --host 127.0.0.1 --port 4173',
				url: baseURL,
				reuseExistingServer: !process.env.CI,
				timeout: 120_000,
			}
		: undefined,
});
