<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { authSession, startOAuthLogin } from '$lib/auth/session';
	import { createLesserHostSoulClient, type SoulAgentChannelsResponse } from '$lib/greater/adapters/soul';
	import * as Soul from '$lib/components/soul';

	let query = $state('');
	let result = $state<SoulAgentChannelsResponse | null>(null);
	let resolvedAgentId = $state<string | null>(null);
	let isLoading = $state(false);
	let isLoggingIn = $state(false);
	let error = $state<string | null>(null);

	const SOUL_AGENT_ID_RE = /^0x[0-9a-fA-F]{64}$/;
	let didAutoResolve = false;

	function getClient() {
		if (typeof window === 'undefined') {
			throw new Error('Soul client only available in the browser');
		}
		const accessToken = $authSession?.accessToken?.trim();
		if (!accessToken) {
			throw new Error('Sign in before looking up reachability channels.');
		}
		return createLesserHostSoulClient({
			baseUrl: window.location.origin,
			headers: { authorization: `Bearer ${accessToken}` },
		});
	}

	function isEmail(value: string) {
		return value.includes('@') && value.includes('.');
	}

	function isPhone(value: string) {
		return value.startsWith('+') && /^[+0-9]{6,}$/.test(value);
	}

	async function resolveAgentId(input: string): Promise<string> {
		const candidate = input.trim();
		if (!candidate) throw new Error('Enter an ENS name, email, phone, or agentId.');
		if (SOUL_AGENT_ID_RE.test(candidate)) return candidate;

		const client = getClient();

		if (isEmail(candidate)) {
			const resolved = await client.resolveEmail(candidate);
			return resolved.agent.agent_id;
		}

		if (isPhone(candidate)) {
			const resolved = await client.resolvePhone(candidate);
			return resolved.agent.agent_id;
		}

		const resolved = await client.resolveEns(candidate);
		return resolved.agent.agent_id;
	}

	async function load(input: string) {
		if (!$authSession) {
			error = 'Sign in before looking up reachability channels.';
			return;
		}

		isLoading = true;
		error = null;
		result = null;
		resolvedAgentId = null;

		try {
			const agentId = await resolveAgentId(input);
			resolvedAgentId = agentId;
			const client = getClient();
			result = await client.getAgentChannels(agentId);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isLoading = false;
		}
	}

	function handleSubmit(event: Event) {
		event.preventDefault();
		void load(query);
	}

	async function handleLogin() {
		if (isLoggingIn) return;
		isLoggingIn = true;
		try {
			await startOAuthLogin({
				returnTo: `${$page.url.pathname}${$page.url.search}${$page.url.hash}`,
			});
		} finally {
			isLoggingIn = false;
		}
	}

	function summarizeRateLimits(preferences: Soul.SoulContactPreferences | null): string[] {
		const limits = preferences?.rateLimits;
		if (!limits) return [];

		const parts: string[] = [];
		if (limits.email?.maxInboundPerHour) parts.push(`email ${limits.email.maxInboundPerHour}/hour`);
		if (limits.email?.maxInboundPerDay) parts.push(`email ${limits.email.maxInboundPerDay}/day`);
		if (limits.sms?.maxInboundPerHour) parts.push(`sms ${limits.sms.maxInboundPerHour}/hour`);
		if (limits.sms?.maxInboundPerDay) parts.push(`sms ${limits.sms.maxInboundPerDay}/day`);
		if (limits.voice?.maxConcurrentCalls) parts.push(`voice ${limits.voice.maxConcurrentCalls} concurrent`);
		if (limits.voice?.maxCallsPerDay) parts.push(`voice ${limits.voice.maxCallsPerDay}/day`);
		return parts;
	}

	$effect(() => {
		if (!$authSession) {
			result = null;
			resolvedAgentId = null;
			isLoading = false;
			return;
		}
		if (didAutoResolve) return;
		const q = $page.url.searchParams.get('q')?.trim() ?? '';
		if (!q) return;
		didAutoResolve = true;
		query = q;
		void load(q);
	});
</script>

<svelte:head>
	<title>Reachability • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Reachability</h1>
	<p>Look up an agent by ENS name, email, phone, or agentId after signing in.</p>

	{#if !$authSession}
		<div class="page__notice">
			Reachability can expose contact-channel metadata. Sign in before resolving channels.
		</div>
		<button type="button" class="gr-button gr-button--solid" onclick={handleLogin} disabled={isLoggingIn}>
			{isLoggingIn ? 'Redirecting…' : 'Sign in to continue'}
		</button>
	{:else}
	<form class="settings-form" onsubmit={handleSubmit}>
		<label class="settings-field settings-field--full">
			<span class="settings-field__label">Lookup</span>
			<input
				class="settings-field__input"
				type="text"
				placeholder="agent-alice.lessersoul.eth, alice@example.com, +15551234567, 0x…"
				bind:value={query}
				disabled={isLoading}
			/>
		</label>

		<div class="settings-form__actions">
			<button type="submit" class="gr-button gr-button--solid" disabled={isLoading || !query.trim()}>
				{isLoading ? 'Resolving…' : 'Resolve'}
			</button>
			<a class="gr-button gr-button--outline" href={`${base}/reachability`}>
				Clear
			</a>
		</div>
	</form>
	{/if}

	{#if error}
		<div class="page__notice page__notice--error" role="alert">{error}</div>
	{/if}

	{#if resolvedAgentId && !result}
		<div class="page__notice">Resolved {resolvedAgentId}. Loading channels…</div>
	{/if}

	{#if result}
		{@const preferences = result.contactPreferences ?? null}
		{@const rateLimitHints = summarizeRateLimits(preferences)}
		{#if preferences}
			<div class="page__notice">
				<strong>Respect preferences:</strong>
				preferred {preferences.preferred}
				{#if preferences.languages.length}
					· languages {preferences.languages.join(', ')}
				{/if}
				{#if rateLimitHints.length}
					· rate limits {rateLimitHints.join(' · ')}
				{/if}
				{#if preferences.firstContact?.introductionExpected}
					· include an introduction
				{/if}
				{#if preferences.firstContact?.requireSoul}
					· soul senders preferred
				{/if}
			</div>
		{/if}

		<Soul.BestWayToContact channels={result.channels} preferences={preferences} />

		<Soul.ContactPreferencesViewer
			preferences={preferences}
			updatedAt={result.updatedAt}
			title="Contact preferences"
		/>

		<Soul.ChannelsDisplay
			agentId={result.agentId}
			channels={result.channels}
			updatedAt={result.updatedAt}
			title="Reachability channels"
		/>
	{/if}
</section>
