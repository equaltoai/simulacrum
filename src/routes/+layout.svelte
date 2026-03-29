<script lang="ts">
	import '$lib/styles/greater/tokens.css';
	import '$lib/styles/greater/primitives.css';
	import '$lib/styles/greater/agent.css';
	import '$lib/styles/greater/social.css';
	import '$lib/styles/app.css';

	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	import { IdProvider } from '$lib/greater/utils';
	import { ThemeProvider, ThemeSwitcher } from '$lib/greater/primitives';
	import favicon from '$lib/assets/favicon.svg';
	import { hasAdminScope } from '$lib/auth/scopes';
	import { authSession, clearAuthSession, initAuthFromStorage, startOAuthLogin } from '$lib/auth/session';

	let { children } = $props();
	let isLoggingIn = $state(false);

	const navItems = [
		{ label: 'Home', href: `${base}/` },
		{ label: 'Search', href: `${base}/search` },
		{ label: 'Reachability', href: `${base}/reachability` },
		{ label: 'Explore', href: `${base}/explore` },
		{ label: 'Agents', href: `${base}/agents` },
		{ label: 'Souls', href: `${base}/souls` },
		{ label: 'Lists', href: `${base}/lists` },
		{ label: 'Notifications', href: `${base}/notifications` },
		{ label: 'Conversations', href: `${base}/conversations` },
		{ label: 'Profile', href: `${base}/profile` },
		{ label: 'Settings', href: `${base}/settings` },
		{ label: 'Admin', href: `${base}/admin` },
	] as const;

	function isActive(href: string) {
		const pathname = $page.url.pathname;

		if (href.endsWith('/') && pathname === href.slice(0, -1)) return true;
		if (!href.endsWith('/') && pathname === `${href}/`) return true;

		return pathname === href;
	}

	onMount(() => {
		initAuthFromStorage();
	});

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

	function handleLogout() {
		clearAuthSession();
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<IdProvider>
	<ThemeProvider>
		<div class="shell">
			<header class="shell__header">
				<a class="shell__brand" href={`${base}/`}>
					<span class="shell__mark" aria-hidden="true">S</span>
					<span class="shell__title">
						<strong>Simulacrum</strong>
						<span>Instance client</span>
					</span>
				</a>

				<div class="shell__actions">
					<ThemeSwitcher variant="compact" />

					{#if $authSession}
						<button type="button" class="gr-button gr-button--outline" onclick={handleLogout}>
							Log out
						</button>
					{:else}
						<button
							type="button"
							class="gr-button gr-button--solid"
							onclick={handleLogin}
							disabled={isLoggingIn}
						>
							Sign in
						</button>
					{/if}
				</div>
			</header>

			<div class="shell__body">
					<nav class="shell__nav" aria-label="Primary">
						{#each navItems as item (item.href)}
							{#if item.label !== 'Admin' || hasAdminScope($authSession?.scope)}
								<a href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
									{item.label}
								</a>
							{/if}
						{/each}
					</nav>

				<main class="shell__main">
					{@render children()}
				</main>
			</div>
		</div>
	</ThemeProvider>
</IdProvider>
