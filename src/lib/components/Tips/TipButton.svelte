<script lang="ts">
	import { createModal } from '$lib/greater/headless/modal';
	import { Button } from '$lib/greater/primitives';
	import { DollarSignIcon } from '$lib/greater/icons';
	import type { Account } from '$lib/types';
	import {
		encodeTipEthCallData,
		getInjectedProvider,
		getTipsConfig,
		hostIdFromDomain,
		isHexAddress,
		isHexBytes32,
		parseEtherToWei,
		requestAccounts,
		switchChain,
		getChainId,
		sendTransaction,
		toHexQuantity,
		waitForReceipt,
		type TipsConfig,
	} from '$lib/tips';

	interface Props {
		recipient: Account;
		contentHash?: string | null;
		label?: string;
		mode?: 'icon' | 'button';
		class?: string;
		defaultAmount?: string;
	}

	let {
		recipient,
		contentHash,
		label = 'Tip',
		mode = 'icon',
		class: className = '',
		defaultAmount = '0.001',
	}: Props = $props();

	const modal = createModal({ closeOnEscape: true, closeOnBackdrop: true });

	const ZERO_HASH = `0x${'0'.repeat(64)}` as const;

	let tipsConfig = $state<TipsConfig | null>(null);
	let loadingConfig = $state(false);
	let configError = $state<string | null>(null);

	let amount = $state('');
	let txHash = $state<`0x${string}` | null>(null);
	let txStatus = $state<'idle' | 'awaiting_wallet' | 'submitted' | 'confirmed' | 'failed'>('idle');
	let txError = $state<string | null>(null);

	function resetTx() {
		txHash = null;
		txStatus = 'idle';
		txError = null;
		amount = defaultAmount;
	}

	async function ensureConfig() {
		if (tipsConfig) return tipsConfig;
		if (loadingConfig) return null;

		loadingConfig = true;
		configError = null;
		try {
			tipsConfig = await getTipsConfig();
			return tipsConfig;
		} catch (err) {
			configError = err instanceof Error ? err.message : String(err);
			return null;
		} finally {
			loadingConfig = false;
		}
	}

	function resolveContentHash(): `0x${string}` {
		if (isHexBytes32(contentHash ?? undefined)) return contentHash as `0x${string}`;
		return ZERO_HASH;
	}

	function explorerBase(chainId: number): string | null {
		switch (chainId) {
			case 1:
				return 'https://etherscan.io';
			case 8453:
				return 'https://basescan.org';
			case 11155111:
				return 'https://sepolia.etherscan.io';
			default:
				return null;
		}
	}

	function explorerTxUrl(chainId: number, hash: `0x${string}`): string | null {
		const base = explorerBase(chainId);
		return base ? `${base}/tx/${hash}` : null;
	}

	function open() {
		resetTx();
		modal.helpers.open();
		void ensureConfig();
	}

	function close() {
		modal.helpers.close();
	}

	async function submitTip() {
		txError = null;

		const config = await ensureConfig();
		if (!config) return;
		if (!config.enabled || !config.chainId || !config.contractAddress) {
			txError = 'Tipping is not enabled on this instance.';
			return;
		}

		const recipientAddress = typeof recipient.tipAddress === 'string' ? recipient.tipAddress.trim() : '';
		if (!isHexAddress(recipientAddress)) {
			txError = 'This creator has not configured a tip address.';
			return;
		}

		const provider = getInjectedProvider();
		if (!provider) {
			txError = 'No injected wallet provider detected (e.g. MetaMask).';
			return;
		}

		txStatus = 'awaiting_wallet';

		try {
			const [from] = await requestAccounts(provider);
			if (!from) throw new Error('No wallet account selected');

			const currentChainId = await getChainId(provider);
			if (currentChainId !== config.chainId) {
				await switchChain(provider, config.chainId);
			}

			const domain = typeof window !== 'undefined' ? window.location.hostname : '';
			const hostId = hostIdFromDomain(domain);

			const data = encodeTipEthCallData({
				hostId,
				actor: recipientAddress,
				contentHash: resolveContentHash(),
			});

			const wei = parseEtherToWei(amount);
			if (wei <= 0n) throw new Error('Tip amount must be greater than 0');

			const hash = await sendTransaction(provider, {
				from,
				to: config.contractAddress,
				data,
				value: toHexQuantity(wei),
			});

			txHash = hash;
			txStatus = 'submitted';

			const receipt = await waitForReceipt(provider, hash);
			const ok = receipt?.status ? receipt.status !== '0x0' : true;
			txStatus = ok ? 'confirmed' : 'failed';
		} catch (err) {
			txStatus = 'failed';
			txError = err instanceof Error ? err.message : String(err);
		}
	}
</script>

{#if mode === 'icon'}
	<Button
		variant="ghost"
		size="sm"
		class={`tip-button tip-button--icon ${className}`}
		onclick={open}
		aria-label={label}
		title={label}
	>
		<DollarSignIcon />
	</Button>
{:else}
	<Button variant="solid" size="md" class={`tip-button ${className}`} onclick={open}>
		<DollarSignIcon />
		<span>{label}</span>
	</Button>
{/if}

{#if modal.state.open}
	<div use:modal.actions.backdrop class="tip-modal__backdrop">
		<div use:modal.actions.content class="tip-modal">
			<header class="tip-modal__header">
				<h3 class="tip-modal__title">Send a tip</h3>
				<Button variant="ghost" size="sm" onclick={close} aria-label="Close">
					×
				</Button>
			</header>

			<div class="tip-modal__body">
				<div class="tip-modal__row">
					<div class="tip-modal__label">Recipient</div>
					<div class="tip-modal__value">
						<strong>{recipient.displayName || recipient.username}</strong>
						<span class="tip-modal__muted">@{recipient.acct}</span>
					</div>
				</div>

				{#if configError}
					<div class="tip-modal__notice tip-modal__notice--error" role="alert">{configError}</div>
				{/if}

				{#if loadingConfig}
					<div class="tip-modal__notice">Loading tip config…</div>
				{:else if tipsConfig && !tipsConfig.enabled}
					<div class="tip-modal__notice">Tipping is disabled on this instance.</div>
				{:else if tipsConfig?.enabled && tipsConfig.chainId && tipsConfig.contractAddress}
					<div class="tip-modal__config">
						<div class="tip-modal__row">
							<div class="tip-modal__label">Chain ID</div>
							<div class="tip-modal__value">{tipsConfig.chainId}</div>
						</div>
						<div class="tip-modal__row">
							<div class="tip-modal__label">Contract</div>
							<div class="tip-modal__value"><code>{tipsConfig.contractAddress}</code></div>
						</div>
					</div>
				{/if}

				<div class="tip-modal__row">
					<label class="tip-modal__label" for="tip-amount">Amount (ETH)</label>
					<input
						id="tip-amount"
						class="tip-modal__input"
						type="text"
						inputmode="decimal"
						placeholder="0.001"
						bind:value={amount}
						disabled={txStatus === 'awaiting_wallet' || txStatus === 'submitted'}
					/>
				</div>

				<div class="tip-modal__presets" role="group" aria-label="Tip presets">
					{#each ['0.0001', '0.001', '0.01', '0.1'] as preset (preset)}
						<Button
							variant="outline"
							size="sm"
							onclick={() => (amount = preset)}
							disabled={txStatus === 'awaiting_wallet' || txStatus === 'submitted'}
						>
							{preset}
						</Button>
					{/each}
				</div>

				{#if txError}
					<div class="tip-modal__notice tip-modal__notice--error" role="alert">{txError}</div>
				{/if}

				{#if txHash && tipsConfig?.chainId}
					{@const url = explorerTxUrl(tipsConfig.chainId, txHash)}
					<div class="tip-modal__tx">
						<div class="tip-modal__label">Transaction</div>
						<div class="tip-modal__value">
							<code>{txHash}</code>
							{#if url}
								<a class="tip-modal__link" href={url} target="_blank" rel="noopener noreferrer">
									View
								</a>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<footer class="tip-modal__footer">
				<Button
					variant="outline"
					size="md"
					onclick={close}
					disabled={txStatus === 'awaiting_wallet' || txStatus === 'submitted'}
				>
					Close
				</Button>
				<Button
					variant="solid"
					size="md"
					onclick={submitTip}
					disabled={txStatus === 'awaiting_wallet' || txStatus === 'submitted'}
				>
					{#if txStatus === 'awaiting_wallet'}
						Waiting for wallet…
					{:else if txStatus === 'submitted'}
						Submitted…
					{:else if txStatus === 'confirmed'}
						Tipped!
					{:else}
						Send tip
					{/if}
				</Button>
			</footer>
		</div>
	</div>
{/if}
