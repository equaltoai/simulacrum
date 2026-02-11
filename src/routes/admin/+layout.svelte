<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';

	import { DEFAULT_OAUTH_SCOPE, authSession, startOAuthLogin } from '$lib/auth/session';

	let { children } = $props();

	const ADMIN_OAUTH_SCOPE = `${DEFAULT_OAUTH_SCOPE} admin admin:read admin:write`;

	const navItems = [
		{ label: 'Reports', href: `${base}/admin` },
		{ label: 'Accounts', href: `${base}/admin/accounts` },
		{ label: 'Statuses', href: `${base}/admin/statuses` },
		{ label: 'Instance', href: `${base}/admin/instance` },
		{ label: 'Agents', href: `${base}/admin/agents` },
	] as const;

	function isActive(href: string) {
		const pathname = $page.url.pathname;
		if (href.endsWith('/') && pathname === href.slice(0, -1)) return true;
		if (!href.endsWith('/') && pathname === `${href}/`) return true;
		return pathname === href;
	}

	function hasAdminScope(scope?: string) {
		const value = scope ?? '';
		const parts = value.split(/\s+/g).filter(Boolean);
		return parts.includes('admin') || parts.includes('admin:read') || parts.includes('admin:write');
	}

	let isUpgrading = $state(false);
	let upgradeError = $state<string | null>(null);

	async function handleUpgrade() {
		if (isUpgrading) return;
		isUpgrading = true;
		upgradeError = null;

		try {
			await startOAuthLogin({
				scope: ADMIN_OAUTH_SCOPE,
				returnTo: `${$page.url.pathname}${$page.url.search}${$page.url.hash}`,
			});
		} catch (err) {
			upgradeError = err instanceof Error ? err.message : String(err);
		} finally {
			isUpgrading = false;
		}
	}
</script>

<section class="page">
	<h1>Admin</h1>

	{#if !$authSession}
		<p>Sign in with an admin account to access instance tools.</p>
		<button type="button" class="gr-button gr-button--solid" onclick={handleUpgrade} disabled={isUpgrading}>
			{isUpgrading ? 'Redirecting…' : 'Sign in for admin'}
		</button>
		{#if upgradeError}
			<div class="page__notice page__notice--error" role="alert">{upgradeError}</div>
		{/if}
	{:else if !hasAdminScope($authSession.scope)}
		<div class="page__notice page__notice--error" role="alert">
			This session is missing admin OAuth scopes. Re-authenticate to continue.
		</div>
		<button type="button" class="gr-button gr-button--solid" onclick={handleUpgrade} disabled={isUpgrading}>
			{isUpgrading ? 'Redirecting…' : 'Re-authenticate'}
		</button>
		{#if upgradeError}
			<div class="page__notice page__notice--error" role="alert">{upgradeError}</div>
		{/if}
	{:else}
		<nav class="tabs" aria-label="Admin sections">
			{#each navItems as item (item.href)}
				<a class={`tabs__tab ${isActive(item.href) ? 'is-active' : ''}`} href={item.href}>
					{item.label}
				</a>
			{/each}
		</nav>

		{@render children()}
	{/if}
</section>

