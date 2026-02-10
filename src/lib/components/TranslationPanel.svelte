<script lang="ts">
	import { api, type StatusTranslation } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';

	interface Props {
		statusId: string;
		targetLanguage?: string;
		class?: string;
	}

	let { statusId, targetLanguage, class: className = '' }: Props = $props();

	let open = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let translation = $state<StatusTranslation | null>(null);

	const resolvedTargetLanguage = $derived.by(() => {
		if (typeof targetLanguage === 'string' && targetLanguage.trim()) return targetLanguage.trim();
		if (typeof navigator !== 'undefined' && typeof navigator.language === 'string' && navigator.language.trim()) {
			return navigator.language.split('-')[0] || 'en';
		}
		return 'en';
	});

	async function loadTranslation() {
		if (!$authSession?.accessToken) return;
		if (loading || translation) return;

		loading = true;
		error = null;

		try {
			translation = await api.translateStatus({ id: statusId, targetLanguage: resolvedTargetLanguage });
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	async function toggle() {
		open = !open;
		if (open) {
			await loadTranslation();
		}
	}
</script>

<div class={`translation-panel ${className}`}>
	<button type="button" class="translation-panel__toggle gr-button gr-button--outline" onclick={toggle}>
		{open ? 'Hide translation' : `Translate to ${resolvedTargetLanguage.toUpperCase()}`}
	</button>

	{#if open}
		{#if loading}
			<div class="translation-panel__notice">Translating…</div>
		{:else if error}
			<div class="translation-panel__notice translation-panel__notice--error" role="alert">
				Failed to translate: {error}
			</div>
		{:else if translation}
			<div class="translation-panel__meta">
				<span>Detected: {translation.detectedLanguage}</span>
				<span>Provider: {translation.provider}</span>
			</div>
			<ContentRenderer
				class="translation-panel__content"
				content={translation.content}
				spoilerText={translation.spoilerText ?? undefined}
				collapsed={false}
			/>
		{/if}
	{/if}
</div>

