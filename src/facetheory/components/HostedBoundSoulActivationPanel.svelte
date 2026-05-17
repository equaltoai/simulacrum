<script lang="ts">
	import { AnchorAssuranceBadge, type SoulAnchorAssurance, type SoulChannels } from '$lib/components/soul';

	interface Props {
		agentUsername?: string | null;
		anchorAssurance?: SoulAnchorAssurance | null;
		boundSoulAgentId?: string | null;
		channels?: SoulChannels | null;
		showReachability?: boolean;
	}

	let {
		agentUsername = null,
		anchorAssurance = null,
		boundSoulAgentId = null,
		channels = null,
		showReachability = false,
	}: Props = $props();

	const hostedPreview: SoulAnchorAssurance = {
		state: 'hosted_offchain',
		source: 'host_record',
		capability_gate: false,
		mutable: true,
		revocable: true,
	};
	const onchainPreview: SoulAnchorAssurance = {
		state: 'immutable_onchain',
		source: 'onchain_receipt',
		capability_gate: false,
		mutable: false,
		revocable: false,
	};

	const emailConfigured = $derived(Boolean(channels?.email?.capabilities?.includes('receive')));
	const smsConfigured = $derived(Boolean(channels?.phone?.capabilities?.includes('sms-receive')));
	const voiceConfigured = $derived(Boolean(channels?.phone?.capabilities?.includes('voice-receive')));
	const phoneConfigured = $derived(Boolean(channels?.phone));
	const displayName = $derived(agentUsername ? `@${agentUsername}` : 'this drone body');
	const activeSoulLabel = $derived(boundSoulAgentId ? 'Bound soul selected' : 'No bound soul selected');
</script>

<section class="ft-panel hbs-activation" data-testid="hosted-bound-soul-activation-panel">
	<header class="ft-panel__header">
		<div>
			<p class="ft-panel__eyebrow">Hosted bound soul launch prototype</p>
			<h2>Activation and public-access disclosures</h2>
		</div>
		<span class="ft-panel__badge">Prototype review</span>
	</header>

	<p class="ft-panel__copy">
		Review this disclosure before binding or activating a hosted bound soul for {displayName}. Public launch remains
		blocked until the parent launch gate records final copy and signoff.
	</p>

	<div class="hbs-activation__grid" aria-label="Activation channel disclosures">
		<article class="hbs-activation__card hbs-activation__card--default">
			<p class="hbs-activation__kicker">Default channel</p>
			<h3>Email</h3>
			<p>
				Email is the default hosted communication path when a verified, active channel exists and policy permits it.
				It is reviewed separately from paid phone/SMS/voice add-ons.
			</p>
			<span class="hbs-activation__status">{emailConfigured && showReachability ? 'Available on this soul' : 'Default path; verify before launch'}</span>
		</article>

		<article class="hbs-activation__card">
			<p class="hbs-activation__kicker">Paid add-on</p>
			<h3>Phone + SMS</h3>
			<p>
				Phone and SMS require explicit operator opt-in plus a provisioned or paid entitlement. The prototype must not
				treat a phone number as public reachability.
			</p>
			<span class="hbs-activation__status">{phoneConfigured && smsConfigured && showReachability ? 'Provisioned for this soul' : 'Paid/provisioned add-on'}</span>
		</article>

		<article class="hbs-activation__card">
			<p class="hbs-activation__kicker">Paid add-on</p>
			<h3>Voice</h3>
			<p>
				Voice remains denied until the responsible operator opts in and the paid/provisioned entitlement permits voice
				traffic. Carrier/provider failures stay outside public diagnostics.
			</p>
			<span class="hbs-activation__status">{voiceConfigured && showReachability ? 'Provisioned for this soul' : 'Paid/provisioned add-on'}</span>
		</article>
	</div>

	<div class="hbs-activation__assurance">
		<div>
			<p class="hbs-activation__kicker">Assurance before commitment</p>
			<h3>{activeSoulLabel}</h3>
			<p>
				Hosted/offchain and immutable/onchain are trust-display states, not capability authority. On-chain anchoring is
				not a prerequisite for basic hosted-bound-soul function.
			</p>
		</div>
		<AnchorAssuranceBadge assurance={anchorAssurance} showDetails={Boolean(anchorAssurance)} />
	</div>

	<div class="hbs-activation__assurance-examples" aria-label="Anchor assurance state examples">
		<div>
			<AnchorAssuranceBadge assurance={hostedPreview} showTrustNotice={false} title="Hosted offchain preview" />
			<p>Host-managed registry state; valid when explicit policy permits the requested capability.</p>
		</div>
		<div>
			<AnchorAssuranceBadge assurance={onchainPreview} showTrustNotice={false} title="Immutable onchain preview" />
			<p>Optional assurance upgrade with on-chain evidence; it must not create a second namespace or hidden gate.</p>
		</div>
	</div>

	<div class="hbs-activation__x402">
		<p class="hbs-activation__kicker">x402 public paid access</p>
		<h3>Scoped invocation only</h3>
		<ul>
			<li>Paid public callers receive a bounded off-chain invocation grant for one declared agent/capability/tool/resource.</li>
			<li>No principal, operator, session, wallet, tenant-data, mailbox-browsing, or on-chain authority is granted.</li>
			<li>Payment evidence stays minimized; support/refund handling must be approved before production copy is frozen.</li>
		</ul>
	</div>
</section>

<style>
	.hbs-activation,
	.hbs-activation__card,
	.hbs-activation__assurance,
	.hbs-activation__assurance-examples,
	.hbs-activation__x402 {
		display: grid;
		gap: 0.85rem;
	}

	.hbs-activation__grid,
	.hbs-activation__assurance-examples {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.85rem;
	}

	.hbs-activation__assurance-examples {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.hbs-activation__card,
	.hbs-activation__assurance,
	.hbs-activation__assurance-examples > div,
	.hbs-activation__x402 {
		padding: 1rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.72);
		box-shadow: 0 18px 44px rgba(123, 70, 27, 0.08);
	}

	.hbs-activation__card--default {
		background: color-mix(in srgb, var(--gr-color-success-100) 55%, white 45%);
	}

	.hbs-activation__assurance {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
	}

	.hbs-activation__kicker,
	.hbs-activation__status {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gr-semantic-foreground-secondary);
	}

	.hbs-activation h3,
	.hbs-activation p,
	.hbs-activation ul {
		margin: 0;
	}

	.hbs-activation p,
	.hbs-activation li {
		color: var(--gr-semantic-foreground-secondary);
		line-height: 1.5;
	}

	.hbs-activation ul {
		padding-left: 1.2rem;
	}

	@media (max-width: 960px) {
		.hbs-activation__grid,
		.hbs-activation__assurance,
		.hbs-activation__assurance-examples {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
