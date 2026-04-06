import { test as base, expect, type Page, type TestInfo } from '@playwright/test';

type ConsoleEntry = {
	type: string;
	text: string;
	location?: string;
};

async function attachFailureArtifacts(
	page: Page,
	testInfo: TestInfo,
	consoleEntries: readonly ConsoleEntry[]
) {
	const consoleText = consoleEntries.length
		? consoleEntries
				.map((entry) => `${entry.type.toUpperCase()}${entry.location ? ` [${entry.location}]` : ''}: ${entry.text}`)
				.join('\n')
		: 'No console or pageerror messages were captured.';

	await testInfo.attach('console.log', {
		body: Buffer.from(`${consoleText}\n`, 'utf8'),
		contentType: 'text/plain',
	});

	await testInfo.attach('dom.html', {
		body: Buffer.from(await page.content(), 'utf8'),
		contentType: 'text/html',
	});

	await testInfo.attach('page.json', {
		body: Buffer.from(
			JSON.stringify(
				{
					url: page.url(),
					title: await page.title(),
				},
				null,
				2
			),
			'utf8'
		),
		contentType: 'application/json',
	});
}

export const test = base.extend({
	page: async ({ page }, use, testInfo) => {
		const consoleEntries: ConsoleEntry[] = [];

		page.on('console', (message) => {
			const location = message.location();
			const formattedLocation =
				location.url && location.lineNumber != null
					? `${location.url}:${location.lineNumber}:${location.columnNumber ?? 0}`
					: undefined;
			consoleEntries.push({
				type: message.type(),
				text: message.text(),
				location: formattedLocation,
			});
		});

		page.on('pageerror', (error) => {
			consoleEntries.push({
				type: 'pageerror',
				text: error.stack ?? error.message,
			});
		});

		await use(page);

		if (testInfo.status !== testInfo.expectedStatus) {
			await attachFailureArtifacts(page, testInfo, consoleEntries);
		}
	},
});

export { expect };
