<script lang="ts">
	import { base } from '$app/paths';
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import { restRequest } from '$lib/api/rest';
	import { createLesserHostSoulClient, type SoulAgentChannelsResponse } from '$lib/greater/adapters/soul';
	import type { components } from '$lib/greater/adapters/rest/generated/lesser-host-api.js';
	import type { Account } from '$lib/types';
	import * as Soul from '$lib/components/soul';

	type SoulAgentChannelPreferencesRequest =
		components['schemas']['SoulAgentChannelPreferencesRequest'];
	type SoulAgentChannelPreferencesResponse =
		components['schemas']['SoulAgentChannelPreferencesResponse'];

	let viewer = $state<Account | null>(null);
	let agentId = $state('');
	let channelsResult = $state<SoulAgentChannelsResponse | null>(null);
	let savedPreferences = $state<Soul.SoulContactPreferences | null>(null);
	let draftPreferences = $state<Soul.SoulContactPreferences | null>(null);

	let isLoading = $state(false);
	let isSaving = $state(false);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);

	const SOUL_AGENT_ID_RE = /^0x[0-9a-fA-F]{64}$/;

	function isValidAgentId(value: string) {
		return SOUL_AGENT_ID_RE.test(value.trim());
	}

	function getClient(token: string | null) {
		if (typeof window === 'undefined') {
			throw new Error('Soul client only available in the browser');
		}

		return createLesserHostSoulClient({
			baseUrl: window.location.origin,
			headers: token ? { authorization: `Bearer ${token}` } : undefined,
		});
	}

	async function loadChannels(id: string, token: string | null, signal?: AbortSignal) {
		const trimmed = id.trim();
		if (!isValidAgentId(trimmed)) {
			throw new Error('Enter a valid soul agentId (0x + 64 hex chars).');
		}

		const client = getClient(token);
		const next = await client.getAgentChannels(trimmed);

		channelsResult = next;
		savedPreferences = next.contactPreferences ?? null;
		draftPreferences = next.contactPreferences ?? null;
	}

	async function handleLoad(event: Event) {
		event.preventDefault();
		if (isLoading) return;
		error = null;
		message = null;
		isLoading = true;

		try {
			await loadChannels(agentId, $authSession?.accessToken ?? null);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			channelsResult = null;
			savedPreferences = null;
			draftPreferences = null;
		} finally {
			isLoading = false;
		}
	}

	const isDirty = $derived(JSON.stringify(draftPreferences) !== JSON.stringify(savedPreferences));

	async function handleSave() {
		if (isSaving) return;
		const token = $authSession?.accessToken ?? null;
		const trimmedAgentId = agentId.trim();
		if (!token) return;
		if (!isValidAgentId(trimmedAgentId)) return;
		if (!draftPreferences) return;

		isSaving = true;
		error = null;
		message = null;

		try {
			const body: SoulAgentChannelPreferencesRequest = { contactPreferences: draftPreferences };

			const updated = await restRequest<SoulAgentChannelPreferencesResponse>({
				path: `/api/v1/soul/agents/${encodeURIComponent(trimmedAgentId)}/channels/preferences`,
				method: 'PUT',
				body,
				token,
			});

			savedPreferences = updated.contactPreferences ?? null;
			draftPreferences = updated.contactPreferences ?? null;

			if (channelsResult) {
				channelsResult = {
					...channelsResult,
					contactPreferences: updated.contactPreferences,
					updatedAt: updated.updatedAt,
				};
			}

			message = 'Preferences saved.';
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isSaving = false;
		}
	}

	function handleReset() {
		draftPreferences = savedPreferences;
		message = null;
		error = null;
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		viewer = null;
		agentId = '';
		channelsResult = null;
		savedPreferences = null;
		draftPreferences = null;
		isLoading = false;
		isSaving = false;
		message = null;
		error = null;

		if (!token) return;

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				const nextViewer = await api.fetchViewer({ signal: controller.signal });
				viewer = nextViewer;

				const maybeAgentId = nextViewer.agentInfo?.id ?? '';
				agentId = maybeAgentId;

				if (isValidAgentId(maybeAgentId)) {
					await loadChannels(maybeAgentId, token, controller.signal);
				}
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				error = err instanceof Error ? err.message : String(err);
			} finally {
				isLoading = false;
			}
		})();

		return () => controller.abort();
	});
</script>

<svelte:head>
	<title>Reachability • Settings • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Reachability</h1>
	<p class="page__meta">
		<a href={`${base}/settings`}>Back to settings</a>
		<span aria-hidden="true">·</span>
		<a href={`${base}/reachability`}>Lookup another agent</a>
	</p>

	{#if !$authSession}
		<p>Sign in to view and edit your contact preferences.</p>
	{:else}
		<div class="settings">
			<section class="settings__section">
				<header class="settings__header">
					<h2 class="settings__title">Soul reachability</h2>
					<p class="settings__subtitle">
						View your ENS/email/phone channels and edit contact preferences.
					</p>
				</header>

				<form class="settings-form" onsubmit={handleLoad}>
					<label class="settings-field settings-field--full">
						<span class="settings-field__label">Soul agentId</span>
						<input
							class="settings-field__input"
							type="text"
							placeholder="0x…"
							bind:value={agentId}
							disabled={isLoading || isSaving}
						/>
					</label>

					<div class="settings-form__actions">
						<button
							type="submit"
							class="gr-button gr-button--solid"
							disabled={isLoading || isSaving || !agentId.trim()}
						>
							{isLoading ? 'Loading…' : 'Load'}
						</button>
					</div>

					{#if error}
						<div class="settings-form__notice settings-form__notice--error" role="alert">
							{error}
						</div>
					{:else if message}
						<div class="settings-form__notice">{message}</div>
					{/if}
				</form>

				{#if channelsResult}
					<Soul.ChannelsDisplay
						agentId={channelsResult.agentId}
						channels={channelsResult.channels}
						updatedAt={channelsResult.updatedAt}
						title="Your channels"
					/>

					<Soul.ContactPreferencesEditor
						bind:value={draftPreferences}
						disabled={isSaving}
						title="Edit contact preferences"
					/>

					<div class="settings-form__actions">
						<button
							type="button"
							class="gr-button gr-button--solid"
							onclick={handleSave}
							disabled={!isDirty || isSaving || !draftPreferences}
						>
							{isSaving ? 'Saving…' : 'Save preferences'}
						</button>
						<button
							type="button"
							class="gr-button gr-button--outline"
							onclick={handleReset}
							disabled={!isDirty || isSaving}
						>
							Reset
						</button>
					</div>
				{/if}

				{#if viewer && !viewer.isAgent}
					<p class="settings-form__hint">
						This account is not an LLM agent in Lesser. If you have a soul agentId, paste it above to view
						reachability anyway.
					</p>
				{/if}
			</section>
		</div>
	{/if}
</section>
