<script lang="ts">
	import {
		finalizeSoulBootstrap,
		verifySoulBootstrapPrincipalDeclaration,
		verifySoulBootstrapWallet,
		type SoulBootstrapMutationResult,
		type SoulBootstrapResult,
	} from '$lib/api/soulBootstrap';
	import {
		getAccounts,
		getInjectedProvider,
		personalSign,
		requestAccounts,
		type EthereumProvider,
	} from '$lib/tips/provider';
	import type { SoulBootstrapSigningPlan } from '$lib/greater/adapters/soul';

	import {
		SoulBootstrapSigningUxError,
		assertSoulBootstrapSubmitPrerequisites,
		buildSoulBootstrapSubmitInput,
		createActiveSoulBootstrapSigningPlan,
		isSoulBootstrapSigningPlanError,
		selectSoulBootstrapPersonalSignMaterial,
		signingPlanButtonLabel,
		signingPlanSuccessMessage,
		signingPlanTitle,
		type SoulBootstrapSigningSubmission,
	} from '../bootstrapSigning';

	interface Props {
		result: SoulBootstrapResult | null;
		onUpdated?: () => Promise<void> | void;
	}

	let { result, onUpdated }: Props = $props();

	let signing = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let walletChallengeSignature = $state<string | null>(null);

	const planView = $derived(resolvePlanView(result));
	const activePlan = $derived(planView.plan);
	const planError = $derived(planView.error);
	const planErrorTone = $derived(planView.errorTone);
	const missingPrincipalPrerequisite = $derived(
		activePlan?.kind === 'principal_declaration' && !walletChallengeSignature
	);
	const canSign = $derived(Boolean(activePlan) && !signing && !missingPrincipalPrerequisite);

	function resolvePlanView(source: SoulBootstrapResult | null): {
		plan: SoulBootstrapSigningPlan | null;
		error: string | null;
		errorTone: 'warning' | 'error' | null;
	} {
		try {
			return { plan: createActiveSoulBootstrapSigningPlan(source), error: null, errorTone: null };
		} catch (planFailure) {
			return {
				plan: null,
				error: describeSigningFailure(planFailure),
				errorTone: isSoulBootstrapSigningPlanError(planFailure) ? 'error' : 'warning',
			};
		}
	}

	function truncateAddress(value?: string | null): string {
		const normalized = value?.trim() ?? '';
		if (!normalized) return 'unknown signer';
		if (normalized.length <= 14) return normalized;
		return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
	}

	function formatSigningMaterial(plan: SoulBootstrapSigningPlan): string {
		const signingMaterial = plan.signing;
		if (signingMaterial.messageEncoding === 'utf8') {
			return signingMaterial.message;
		}
		return signingMaterial.messageHex;
	}

	function describeSigningFailure(signingFailure: unknown): string {
		if (signingFailure instanceof SoulBootstrapSigningUxError) {
			return signingFailure.message;
		}

		if (isSoulBootstrapSigningPlanError(signingFailure)) {
			const checkpoint = signingFailure.checkpointName
				? ` (${signingFailure.checkpointName})`
				: '';
			return `Lesser signing material failed the Greater adapter plan guard${checkpoint}: ${signingFailure.message}`;
		}

		const record = signingFailure && typeof signingFailure === 'object'
			? (signingFailure as { code?: unknown; message?: unknown })
			: null;
		if (record?.code === 4001) return 'Wallet signing was rejected by the user.';
		if (typeof record?.message === 'string' && record.message.trim()) return record.message;
		return 'Soul-bootstrap signing failed closed before submission.';
	}

	function isProviderRejection(signingFailure: unknown): boolean {
		const record = signingFailure && typeof signingFailure === 'object'
			? (signingFailure as { code?: unknown; message?: unknown })
			: null;
		return record?.code === 4001 ||
			(typeof record?.message === 'string' && /reject|denied|cancel/i.test(record.message));
	}

	async function requireMatchingWallet(
		provider: EthereumProvider,
		expectedAddress: `0x${string}`
	): Promise<void> {
		let accounts = await getAccounts(provider);
		if (!accounts.some((account) => sameAddress(account, expectedAddress))) {
			accounts = await requestAccounts(provider);
		}

		if (!accounts.some((account) => sameAddress(account, expectedAddress))) {
			const connected = accounts.length
				? accounts.map((account) => truncateAddress(account)).join(', ')
				: 'no connected wallet accounts';
			throw new Error(
				`Connected wallet mismatch: Lesser requires ${truncateAddress(expectedAddress)}, but the provider returned ${connected}.`
			);
		}
	}

	function sameAddress(left: string, right: string): boolean {
		return left.trim().toLowerCase() === right.trim().toLowerCase();
	}

	async function submitSigningResult(
		submission: SoulBootstrapSigningSubmission
	): Promise<SoulBootstrapMutationResult> {
		switch (submission.mutation) {
			case 'verify_wallet':
				return verifySoulBootstrapWallet({ input: submission.input });
			case 'verify_principal_declaration':
				return verifySoulBootstrapPrincipalDeclaration({ input: submission.input });
			case 'finalize':
				return finalizeSoulBootstrap({ input: submission.input });
		}
	}

	async function signAndSubmit() {
		if (signing || !activePlan) return;

		signing = true;
		error = null;
		success = null;

		try {
			const plan = createActiveSoulBootstrapSigningPlan(result);
			assertSoulBootstrapSubmitPrerequisites(plan, { walletChallengeSignature });
			const signMaterial = selectSoulBootstrapPersonalSignMaterial(plan);
			const provider = getInjectedProvider();
			if (!provider) {
				throw new Error('No injected wallet provider is available for EIP-191 personal_sign.');
			}

			try {
				await requireMatchingWallet(provider, signMaterial.signerAddress);
			} catch (walletFailure) {
				if (isProviderRejection(walletFailure)) {
					throw new Error('Wallet account access was rejected by the user.');
				}
				throw walletFailure;
			}

			const signature = await personalSign(provider, {
				address: signMaterial.signerAddress,
				message: signMaterial.message,
			});
			const submission = buildSoulBootstrapSubmitInput(plan, signature, { walletChallengeSignature });
			const mutationResult = await submitSigningResult(submission);

			if (mutationResult.error) {
				throw new Error(
					`Lesser rejected the ${plan.kind} submission: ${mutationResult.error.message}`
				);
			}

			if (plan.kind === 'wallet_challenge') {
				walletChallengeSignature = signature;
			}
			success = signingPlanSuccessMessage(plan);
			await onUpdated?.();
		} catch (signingFailure) {
			if (isProviderRejection(signingFailure)) {
				error = 'Wallet signing was rejected by the user.';
			} else {
				error = describeSigningFailure(signingFailure);
			}
		} finally {
			signing = false;
		}
	}
</script>

<section class="ft-panel" data-testid="soul-bootstrap-signing-panel">
	<header class="ft-panel__header">
		<div>
			<p class="ft-panel__eyebrow">Adapter-provided signing plan</p>
			<h2>{activePlan ? signingPlanTitle(activePlan) : 'No active signing plan'}</h2>
		</div>
	</header>

	{#if activePlan}
		<p class="ft-panel__copy">
			Simulacrum signs only the Greater adapter material returned by Lesser for
			<strong>{activePlan.kind}</strong>. It does not reconstruct Host canonical JSON,
			digests, or request templates in the browser.
		</p>
		<ul class="ft-list">
			<li>Method: {activePlan.signing.method}</li>
			<li>Encoding: {activePlan.signing.messageEncoding}</li>
			<li>Signer: {truncateAddress(activePlan.signing.signerAddress)}</li>
			{#if activePlan.signing.digestHex}
				<li>Digest: {activePlan.signing.digestHex}</li>
			{/if}
			<li>Material field: {activePlan.signing.messageEncoding === 'hex_bytes' ? 'messageHex' : 'message'}</li>
		</ul>
		<details class="ft-panel__details">
			<summary>Review exact wallet material</summary>
			<code>{formatSigningMaterial(activePlan)}</code>
		</details>
		{#if missingPrincipalPrerequisite}
			<p class="ft-panel__message ft-panel__message--warning">
				Principal declaration submission requires the wallet challenge signature captured from
				the preceding Simulacrum signing step. If this page was refreshed, restart from the
				wallet challenge so Simulacrum does not invent backend mappings.
			</p>
		{/if}
		<button class="ft-button ft-button--primary" disabled={!canSign} onclick={signAndSubmit} type="button">
			{signing ? 'Signing…' : signingPlanButtonLabel(activePlan)}
		</button>
	{:else}
		<p class="ft-panel__copy">
			Lesser has not returned an adapter signing plan for the current bootstrap phase. The lane
			stays visible but closed; Simulacrum will not construct Host signing material locally.
		</p>
		{#if planError}
			<p
				class={planErrorTone === 'error'
					? 'ft-panel__message ft-panel__message--error'
					: 'ft-panel__message ft-panel__message--warning'}
			>
				{planError}
			</p>
		{/if}
	{/if}

	{#if error}
		<p class="ft-panel__message ft-panel__message--error" data-testid="soul-bootstrap-signing-error">
			{error}
		</p>
	{/if}
	{#if success}
		<p class="ft-panel__message ft-panel__message--success" data-testid="soul-bootstrap-signing-success">
			{success}
		</p>
	{/if}
</section>
