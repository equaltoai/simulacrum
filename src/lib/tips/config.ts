export type TipsConfig = {
	enabled: boolean;
	chainId?: number;
	contractAddress?: `0x${string}`;
};

type InstanceResponse = {
	configuration?: {
		tips?: {
			enabled?: boolean;
			chain_id?: number;
			contract_address?: string;
		};
	};
};

let cached: TipsConfig | null = null;
let inFlight: Promise<TipsConfig> | null = null;

export async function getTipsConfig(): Promise<TipsConfig> {
	if (cached) return cached;
	if (inFlight) return inFlight;

	inFlight = (async () => {
		const response = await fetch('/api/v1/instance', {
			method: 'GET',
			headers: { accept: 'application/json' },
		});

		const payload = (await response.json().catch(() => null)) as InstanceResponse | null;

		const tips = payload?.configuration?.tips;
		const enabled = tips?.enabled === true;
		const chainId = typeof tips?.chain_id === 'number' ? tips.chain_id : undefined;
		const contractAddressRaw = typeof tips?.contract_address === 'string' ? tips.contract_address.trim() : '';
		const contractAddress = contractAddressRaw.startsWith('0x')
			? (contractAddressRaw as `0x${string}`)
			: undefined;

		const config: TipsConfig = enabled
			? { enabled, chainId, contractAddress }
			: { enabled: false };

		cached = config;
		return config;
	})();

	try {
		return await inFlight;
	} finally {
		inFlight = null;
	}
}

export function clearTipsConfigCache() {
	cached = null;
	inFlight = null;
}

