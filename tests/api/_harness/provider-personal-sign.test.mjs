import assert from 'node:assert/strict';
import test from 'node:test';

import { personalSign } from '../../../src/lib/tips/provider.ts';

const address = '0x1111111111111111111111111111111111111111';
const message = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const signature = `0x${'b'.repeat(130)}`;

test('personalSign retries legacy wallet param order after non-rejection provider errors', async () => {
	const requests = [];
	const provider = {
		async request(args) {
			requests.push(args);
			if (requests.length === 1) {
				const error = new Error('invalid params');
				error.code = -32602;
				throw error;
			}
			return signature;
		},
	};

	const result = await personalSign(provider, { address, message });

	assert.equal(result, signature);
	assert.deepEqual(requests.map((request) => request.params), [
		[message, address],
		[address, message],
	]);
});

test('personalSign does not retry after wallet user rejection', async () => {
	const requests = [];
	const provider = {
		async request(args) {
			requests.push(args);
			const error = new Error('User rejected the request');
			error.code = 4001;
			throw error;
		},
	};

	await assert.rejects(
		() => personalSign(provider, { address, message }),
		(error) => error.code === 4001
	);
	assert.deepEqual(requests.map((request) => request.params), [[message, address]]);
});
