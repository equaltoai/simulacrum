type ProviderRequest = {
	method: string;
	params?: readonly unknown[] | object;
};

export interface EthereumProvider {
	request: (args: ProviderRequest) => Promise<unknown>;
}

export type TransactionReceipt = {
	transactionHash: string;
	status?: string;
	blockNumber?: string;
};

export function getInjectedProvider(): EthereumProvider | null {
	if (typeof window === 'undefined') return null;
	const candidate = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
	if (!candidate || typeof candidate.request !== 'function') return null;
	return candidate;
}

export async function requestAccounts(provider: EthereumProvider): Promise<readonly `0x${string}`[]> {
	const result = await provider.request({ method: 'eth_requestAccounts' });
	if (!Array.isArray(result) || !result.every((item) => typeof item === 'string')) {
		throw new Error('Wallet provider returned invalid accounts response');
	}
	return result as readonly `0x${string}`[];
}

export async function getChainId(provider: EthereumProvider): Promise<number> {
	const result = await provider.request({ method: 'eth_chainId' });
	if (typeof result !== 'string') {
		throw new Error('Wallet provider returned invalid chainId response');
	}
	const chainId = Number.parseInt(result, 16);
	if (Number.isNaN(chainId) || chainId <= 0) {
		throw new Error('Wallet provider returned an invalid chain ID');
	}
	return chainId;
}

export async function switchChain(provider: EthereumProvider, chainId: number): Promise<void> {
	const chainIdHex = `0x${chainId.toString(16)}`;
	try {
		await provider.request({
			method: 'wallet_switchEthereumChain',
			params: [{ chainId: chainIdHex }],
		});
	} catch (error) {
		const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
		if (code === 4902) {
			throw new Error(`Wallet does not have chain ${chainId} configured`);
		}
		throw error instanceof Error ? error : new Error('Failed to switch chain');
	}
}

export async function sendTransaction(
	provider: EthereumProvider,
	tx: {
		from: `0x${string}`;
		to: `0x${string}`;
		data: `0x${string}`;
		value: `0x${string}`;
	}
): Promise<`0x${string}`> {
	const result = await provider.request({
		method: 'eth_sendTransaction',
		params: [tx],
	});
	if (typeof result !== 'string' || !result.startsWith('0x')) {
		throw new Error('Wallet provider returned invalid transaction hash');
	}
	return result as `0x${string}`;
}

export async function personalSign(
	provider: EthereumProvider,
	{ address, message }: { address: `0x${string}`; message: string }
): Promise<`0x${string}`> {
	const result = await provider.request({
		method: 'personal_sign',
		params: [message, address],
	});

	if (typeof result !== 'string' || !result.startsWith('0x')) {
		throw new Error('Wallet provider returned invalid signature');
	}

	return result as `0x${string}`;
}

export async function signTypedDataJson(
	provider: EthereumProvider,
	{ address, typedDataJson }: { address: `0x${string}`; typedDataJson: string }
): Promise<`0x${string}`> {
	const payload = typedDataJson.trim();
	if (!payload) {
		throw new Error('Wallet signing challenge did not include typed data.');
	}

	const parsedPayload = (() => {
		try {
			return JSON.parse(payload);
		} catch {
			return null;
		}
	})();

	const attempts: Array<{ method: string; params: readonly unknown[] }> = [
		{ method: 'eth_signTypedData_v4', params: [address, payload] },
		...(parsedPayload ? [{ method: 'eth_signTypedData', params: [address, parsedPayload] as const }] : []),
		{ method: 'eth_signTypedData', params: [address, payload] },
	];

	let lastError: unknown = null;
	for (const attempt of attempts) {
		try {
			const result = await provider.request({
				method: attempt.method,
				params: attempt.params,
			});

			if (typeof result !== 'string' || !result.startsWith('0x')) {
				throw new Error('Wallet provider returned invalid typed-data signature');
			}

			return result as `0x${string}`;
		} catch (error) {
			const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
			if (code === 4001) {
				throw error instanceof Error ? error : new Error('Wallet signing was rejected.');
			}
			lastError = error;
		}
	}

	throw lastError instanceof Error ? lastError : new Error('Failed to sign wallet challenge.');
}

export async function waitForReceipt(
	provider: EthereumProvider,
	txHash: `0x${string}`,
	{
		pollIntervalMs = 1500,
		timeoutMs = 120_000,
		signal,
	}: { pollIntervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<TransactionReceipt> {
	const start = Date.now();

	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
		if (Date.now() - start > timeoutMs) {
			throw new Error('Timed out waiting for transaction confirmation');
		}

		const receipt = (await provider.request({
			method: 'eth_getTransactionReceipt',
			params: [txHash],
		})) as TransactionReceipt | null;

		if (receipt && typeof receipt === 'object') {
			return receipt;
		}

		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}
}
