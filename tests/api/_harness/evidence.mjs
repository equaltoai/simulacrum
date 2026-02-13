import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function pad3(n) {
	return String(n).padStart(3, '0');
}

function slugToFilename(slug) {
	return String(slug).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function toIso(value) {
	try {
		return new Date(value).toISOString();
	} catch {
		return new Date().toISOString();
	}
}

export class EvidenceWriter {
	#runDir;
	#requestsDir;
	#failuresDir;
	#metaPath;
	#requestSeq = 0;
	#requests = [];
	#results = [];
	#currentTest = null;
	#requestsByTest = new Map();

	meta;

	constructor({ runDir, meta }) {
		this.#runDir = runDir;
		this.#requestsDir = path.join(runDir, 'requests');
		this.#failuresDir = path.join(runDir, 'failures');
		this.#metaPath = path.join(runDir, 'meta.json');

		this.meta = { ...meta };
	}

	get runDir() {
		return this.#runDir;
	}

	async init() {
		await mkdir(this.#runDir, { recursive: true });
		await mkdir(this.#requestsDir, { recursive: true });
		await mkdir(this.#failuresDir, { recursive: true });
		await this.writeMeta();
	}

	updateMeta(patch) {
		this.meta = { ...this.meta, ...patch };
	}

	async writeMeta() {
		await writeFile(this.#metaPath, JSON.stringify(this.meta, null, 2) + '\n', 'utf8');
	}

	startTest({ slug, name }) {
		this.#currentTest = { slug, name };
		if (!this.#requestsByTest.has(slug)) this.#requestsByTest.set(slug, []);
	}

	endTest() {
		this.#currentTest = null;
	}

	recordResult(result) {
		this.#results.push(result);
	}

	async recordRequest(requestRecord) {
		this.#requestSeq += 1;
		const seq = this.#requestSeq;

		const safeName = slugToFilename(requestRecord.name || `request-${seq}`);
		const ext = requestRecord.kind === 'graphql' ? 'graphql' : 'rest';
		const filename = `${pad3(seq)}-${safeName}.${ext}.json`;
		const filepath = path.join(this.#requestsDir, filename);

		const data = { ...requestRecord, recordedAt: new Date().toISOString() };
		await writeFile(filepath, JSON.stringify(data, null, 2) + '\n', 'utf8');

		const tracked = { filename, data };
		this.#requests.push(tracked);

		if (this.#currentTest?.slug) {
			this.#requestsByTest.get(this.#currentTest.slug)?.push(tracked);
		}

		return { seq, filename, filepath };
	}

	getRequestsForTest(slug) {
		return this.#requestsByTest.get(slug) ?? [];
	}

	async writeFailure({ test, error }) {
		const slug = slugToFilename(test.slug);
		const mdPath = path.join(this.#failuresDir, `${slug}.md`);
		const jsonPath = path.join(this.#failuresDir, `${slug}.json`);

		const requests = this.getRequestsForTest(test.slug);

		const failureJson = {
			slug: test.slug,
			name: test.name,
			error: {
				message: error?.message ?? String(error),
				stack: typeof error?.stack === 'string' ? error.stack : null,
			},
			requestFiles: requests.map((r) => r.filename),
			meta: this.meta,
		};

		await writeFile(jsonPath, JSON.stringify(failureJson, null, 2) + '\n', 'utf8');

		const repro = [
			`pnpm api:test --filter ${test.slug} --base-url ${this.meta.baseUrl} --profile ${this.meta.profile}`,
			this.meta.stage ? `pnpm api:test --filter ${test.slug} --base-url ${this.meta.baseUrl} --profile ${this.meta.profile} --stage ${this.meta.stage}` : null,
		]
			.filter(Boolean)
			.join('\n');

		const requestEvidence = requests
			.map((r) => {
				const req = r.data.request ?? {};
				const res = r.data.response ?? {};
				const corr = r.data.correlation ?? {};

				return [
					`### ${r.data.name} (${r.data.kind})`,
					'',
					'**Request**',
					'```json',
					JSON.stringify(req, null, 2),
					'```',
					'',
					'**Response**',
					'```json',
					JSON.stringify(
						{
							status: res.status,
							durationMs: res.durationMs,
							correlation: corr,
							body: res.body,
						},
						null,
						2
					),
					'```',
					'',
				].join('\n');
			})
			.join('\n');

		const md = [
			`# Failure: ${test.slug}`,
			'',
			'## Summary',
			`- Test: ${test.name}`,
			`- Error: ${error?.message ?? String(error)}`,
			'',
			'## Environment',
			'```json',
			JSON.stringify(
				{
					baseUrl: this.meta.baseUrl,
					stage: this.meta.stage ?? null,
					profile: this.meta.profile,
					lesserVersion: this.meta.lesserVersion ?? null,
					startedAt: this.meta.startedAt,
					finishedAt: this.meta.finishedAt ?? null,
				},
				null,
				2
			),
			'```',
			'',
			'## Repro steps',
			'```bash',
			repro,
			'```',
			'',
			'## Evidence',
			...(!requests.length
				? ['(No requests recorded for this test.)', '']
				: [
						'Request files:',
						...requests.map((r) => `- \`artifacts/api/${this.meta.runId}/requests/${r.filename}\``),
						'',
					]),
			requestEvidence,
			'## Notes',
			'- Evidence is redacted (tokens/cookies removed).',
			'',
		].join('\n');

		await writeFile(mdPath, md, 'utf8');
	}

	async writeSummary() {
		const summaryPath = path.join(this.#runDir, 'summary.md');

		const results = this.#results;
		const passed = results.filter((r) => r.status === 'passed').length;
		const failed = results.filter((r) => r.status === 'failed').length;
		const skipped = results.filter((r) => r.status === 'skipped').length;

		const lines = [
			`# API Test Run: ${this.meta.runId}`,
			'',
			`- Base URL: ${this.meta.baseUrl}`,
			this.meta.stage ? `- Stage: ${this.meta.stage}` : null,
			`- Profile: ${this.meta.profile}`,
			this.meta.lesserVersion ? `- Lesser version: ${this.meta.lesserVersion}` : null,
			`- Started: ${toIso(this.meta.startedAt)}`,
			this.meta.finishedAt ? `- Finished: ${toIso(this.meta.finishedAt)}` : null,
			'',
			`## Results (${passed} passed, ${failed} failed, ${skipped} skipped)`,
			'',
			...results.map((r) => {
				const status =
					r.status === 'passed' ? 'PASS' : r.status === 'skipped' ? 'SKIP' : r.status === 'failed' ? 'FAIL' : r.status;
				const extra = r.status === 'failed' ? ` → failures/${slugToFilename(r.slug)}.md` : '';
				return `- ${status}: ${r.slug}${extra}`;
			}),
			'',
		].filter(Boolean);

		await writeFile(summaryPath, lines.join('\n'), 'utf8');
	}
}

