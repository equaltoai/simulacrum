<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { completeOAuthCallback } from '$lib/auth/session';

	let errorMessage = $state<string | null>(null);

	onMount(async () => {
		const result = await completeOAuthCallback($page.url.searchParams);
		if (!result.ok) {
			errorMessage = result.error;
			return;
		}

		await goto(result.returnTo, { replaceState: true });
	});
</script>

<svelte:head>
	<title>Signing in… • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Signing in…</h1>
	{#if errorMessage}
		<p>{errorMessage}</p>
	{:else}
		<p>Completing OAuth login.</p>
	{/if}
</section>

