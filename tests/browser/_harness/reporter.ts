import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
	FullConfig,
	FullResult,
	Reporter,
	Suite,
	TestCase,
	TestResult,
} from '@playwright/test/reporter';

type ReporterOptions = {
	artifactsDir?: string;
	runId?: string;
};

type SummaryResult = {
	file: string;
	title: string;
	status: TestResult['status'];
	retry: number;
	durationMs: number;
};

function relativeFromCwd(target: string | null | undefined): string | null {
	if (!target) return null;
	return path.relative(process.cwd(), target) || '.';
}

function statusLabel(result: SummaryResult): string {
	if (result.status === 'passed' && result.retry > 0) return 'FLAKY';
	if (result.status === 'passed') return 'PASS';
	if (result.status === 'failed') return 'FAIL';
	if (result.status === 'timedOut') return 'TIMEOUT';
	if (result.status === 'skipped') return 'SKIP';
	return result.status.toUpperCase();
}

export default class BrowserSummaryReporter implements Reporter {
	private readonly options: ReporterOptions;
	private readonly results: SummaryResult[] = [];
	private artifactsDir = '';
	private baseURL: string | null = null;
	private startedAt = '';
	private config: FullConfig | null = null;

	constructor(options: ReporterOptions = {}) {
		this.options = options;
	}

	async onBegin(config: FullConfig, suite: Suite) {
		this.config = config;
		this.artifactsDir =
			this.options.artifactsDir ?? path.join('artifacts', 'browser', this.options.runId ?? 'local');
		this.baseURL = String(config.projects[0]?.use?.baseURL ?? '') || null;
		this.startedAt = new Date().toISOString();

		await mkdir(this.artifactsDir, { recursive: true });
		await this.writeMeta({
			runId: this.options.runId ?? path.basename(this.artifactsDir),
			baseURL: this.baseURL,
			startedAt: this.startedAt,
			projectNames: config.projects.map((project) => project.name),
			testCount: suite.allTests().length,
		});
	}

	onTestEnd(test: TestCase, result: TestResult) {
		this.results.push({
			file: relativeFromCwd(test.location.file) ?? test.location.file,
			title: test.titlePath().slice(1).join(' > '),
			status: result.status,
			retry: result.retry,
			durationMs: result.duration,
		});
	}

	async onEnd(result: FullResult) {
		await this.writeMeta({
			runId: this.options.runId ?? path.basename(this.artifactsDir),
			baseURL: this.baseURL,
			startedAt: this.startedAt,
			finishedAt: new Date().toISOString(),
			status: result.status,
			projectNames: this.config?.projects.map((project) => project.name) ?? [],
		});
		await this.writeSummary(result);
	}

	private async writeMeta(payload: Record<string, unknown>) {
		await mkdir(this.artifactsDir, { recursive: true });
		const metaPath = path.join(this.artifactsDir, 'meta.json');
		await writeFile(metaPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
	}

	private async writeSummary(result: FullResult) {
		await mkdir(this.artifactsDir, { recursive: true });
		const summaryPath = path.join(this.artifactsDir, 'summary.md');
		const lines = [
			`# Browser Test Run: ${this.options.runId ?? path.basename(this.artifactsDir)}`,
			'',
			`- Status: ${result.status}`,
			this.baseURL ? `- Base URL: ${this.baseURL}` : null,
			`- Started: ${this.startedAt}`,
			`- Finished: ${new Date().toISOString()}`,
			'',
			'## Results',
			'',
			...this.results.map((entry) => {
				const retryNote = entry.retry > 0 ? ` (retry ${entry.retry})` : '';
				return `- ${statusLabel(entry)}: \`${entry.file}\` :: ${entry.title}${retryNote}`;
			}),
			'',
		].filter(Boolean);

		await writeFile(summaryPath, `${lines.join('\n')}\n`, 'utf8');
	}
}
