<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';

	import '$lib/styles/greater/tokens.css';
	import '$lib/styles/greater/primitives.css';
	import '$lib/styles/greater/social.css';
	import '$lib/styles/app.css';

	import { IdProvider } from '$lib/greater/utils';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	const navItems = [
		{ label: 'Home', href: `${base}/` },
		{ label: 'Explore', href: `${base}/explore` },
		{ label: 'Notifications', href: `${base}/notifications` },
		{ label: 'Profile', href: `${base}/profile` },
		{ label: 'Settings', href: `${base}/settings` },
	] as const;

	function isActive(href: string) {
		const pathname = $page.url.pathname;

		if (href.endsWith('/') && pathname === href.slice(0, -1)) return true;
		if (!href.endsWith('/') && pathname === `${href}/`) return true;

		return pathname === href;
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<IdProvider>
	<div class="shell">
		<header class="shell__header">
			<a class="shell__brand" href={`${base}/`}>
				<span class="shell__mark" aria-hidden="true">S</span>
				<span class="shell__title">
					<strong>Simulacrum</strong>
					<span>Instance client</span>
				</span>
			</a>
		</header>

		<div class="shell__body">
			<nav class="shell__nav" aria-label="Primary">
				{#each navItems as item (item.href)}
					<a href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>{item.label}</a>
				{/each}
			</nav>

			<main class="shell__main">
				{@render children()}
			</main>
		</div>
	</div>
</IdProvider>
