<script lang="ts">
	import { base } from '$app/paths';
	import { api, type LinkedWallet, type UserPreferences } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import type { Account } from '$lib/types';
	import type { DirectMessagesFrom, ExpandMediaPreference, Visibility } from '$lib/greater/adapters/graphql';
	import { getStreamingAdapter } from '$lib/realtime/adapter';
	import {
		PushNotificationsController,
		type PushNotificationsState,
		type PushSubscription,
	} from '$lib/components/Profile/PushNotificationsController';
	import {
		getInjectedProvider,
		getTipsConfig,
		personalSign,
		requestAccounts,
		type TipsConfig,
	} from '$lib/tips';

	type PushAlerts = PushSubscription['alerts'];

	let viewer = $state<Account | null>(null);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);

	let tipsConfig = $state<TipsConfig | null>(null);
	let linkedWallets = $state<LinkedWallet[]>([]);
	let tipsError = $state<string | null>(null);
	let isUpdatingTipWallet = $state(false);
	let tipWalletMessage = $state<string | null>(null);

	let displayName = $state('');
	let bio = $state('');
	let avatar = $state('');
	let header = $state('');
	let isSavingProfile = $state(false);
	let profileMessage = $state<string | null>(null);
	let profileError = $state<string | null>(null);

	let prefLanguage = $state('');
	let prefVisibility = $state<Visibility>('PUBLIC');
	let prefExpandSpoilers = $state(false);
	let prefExpandMedia = $state<ExpandMediaPreference>('DEFAULT');
	let prefAutoplayGifs = $state(false);
	let prefDirectMessagesFrom = $state<DirectMessagesFrom>('FOLLOWING_ONLY');
	let prefReblogFilters = $state<Array<{ key: string; enabled: boolean }>>([]);
	let isSavingPreferences = $state(false);
	let preferencesMessage = $state<string | null>(null);
	let preferencesError = $state<string | null>(null);

	let pushState = $state<PushNotificationsState | null>(null);
	let pushAlerts = $state<PushAlerts>({
		follow: true,
		favourite: true,
		reblog: true,
		mention: true,
		poll: true,
		followRequest: true,
		status: true,
		update: true,
		adminSignUp: false,
		adminReport: false,
	});
	let pushController = $state<PushNotificationsController | null>(null);
	let pushSetupError = $state<string | null>(null);
	let isLoadingPush = $state(false);

	const pushAlertOptions = [
		{ key: 'mention', label: 'Mentions' },
		{ key: 'follow', label: 'Follows' },
		{ key: 'followRequest', label: 'Follow requests' },
		{ key: 'favourite', label: 'Likes' },
		{ key: 'reblog', label: 'Boosts' },
		{ key: 'poll', label: 'Polls' },
		{ key: 'status', label: 'New posts' },
		{ key: 'update', label: 'Edits/updates' },
		{ key: 'adminReport', label: 'Admin reports' },
		{ key: 'adminSignUp', label: 'Admin sign ups' },
	] as const satisfies ReadonlyArray<{ key: keyof PushAlerts; label: string }>;

	function stripHtml(html: string): string {
		if (typeof document === 'undefined') return html;
		const container = document.createElement('div');
		container.innerHTML = html;
		return (container.textContent ?? '').trim();
	}

	function hydrateForms(nextViewer: Account, nextPreferences: UserPreferences) {
		displayName = nextViewer.displayName ?? '';
		bio = nextViewer.note ? stripHtml(nextViewer.note) : '';
		avatar = nextViewer.avatar ?? '';
		header = nextViewer.header ?? '';

		prefLanguage = nextPreferences.posting.defaultLanguage ?? '';
		prefVisibility = nextPreferences.posting.defaultVisibility;
		prefExpandSpoilers = nextPreferences.reading.expandSpoilers;
		prefExpandMedia = nextPreferences.reading.expandMedia;
		prefAutoplayGifs = nextPreferences.reading.autoplayGifs;
		prefDirectMessagesFrom = nextPreferences.privacy.directMessagesFrom;
		prefReblogFilters = nextPreferences.reblogFilters.map((filter) => ({
			key: filter.key,
			enabled: filter.enabled,
		}));
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		viewer = null;
		isLoading = false;
		loadError = null;
		tipsConfig = null;
		linkedWallets = [];
		tipsError = null;
		isUpdatingTipWallet = false;
		tipWalletMessage = null;

		profileMessage = null;
		profileError = null;
		preferencesMessage = null;
		preferencesError = null;

		if (!token) return;

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				const [viewerResult, preferencesResult, walletsResult, tipsConfigResult] =
					await Promise.allSettled([
						api.fetchViewer({ signal: controller.signal }),
						api.fetchUserPreferences({ signal: controller.signal }),
						api.fetchLinkedWallets({ signal: controller.signal }),
						getTipsConfig(),
					]);

				if (controller.signal.aborted) return;

				if (viewerResult.status === 'rejected') throw viewerResult.reason;
				if (preferencesResult.status === 'rejected') throw preferencesResult.reason;

				viewer = viewerResult.value;
				hydrateForms(viewerResult.value, preferencesResult.value);

				if (walletsResult.status === 'fulfilled') {
					linkedWallets = walletsResult.value;
				} else if (!(walletsResult.reason instanceof DOMException && walletsResult.reason.name === 'AbortError')) {
					tipsError =
						walletsResult.reason instanceof Error ? walletsResult.reason.message : String(walletsResult.reason);
					linkedWallets = [];
				}

				if (tipsConfigResult.status === 'fulfilled') {
					tipsConfig = tipsConfigResult.value;
				} else if (!(tipsConfigResult.reason instanceof DOMException && tipsConfigResult.reason.name === 'AbortError')) {
					tipsError =
						tipsError ??
						(tipsConfigResult.reason instanceof Error
							? tipsConfigResult.reason.message
							: String(tipsConfigResult.reason));
					tipsConfig = { enabled: false };
				}
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				loadError = err instanceof Error ? err.message : String(err);
			} finally {
				isLoading = false;
			}
		})();

		return () => controller.abort();
	});

	function parseDateMs(value: string): number {
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? 0 : parsed;
	}

	const defaultTipWallet = $derived(
		linkedWallets.length === 0
			? null
			: linkedWallets.reduce<LinkedWallet | null>((best, wallet) => {
					if (!best) return wallet;
					return parseDateMs(wallet.lastUsed) > parseDateMs(best.lastUsed) ? wallet : best;
				}, null)
	);

	async function handleSetDefaultTipWallet(wallet: LinkedWallet) {
		if (!viewer || isUpdatingTipWallet) return;
		tipsError = null;
		tipWalletMessage = null;

		const provider = getInjectedProvider();
		if (!provider) {
			tipsError = 'No injected wallet provider detected (e.g. MetaMask).';
			return;
		}

		isUpdatingTipWallet = true;
		try {
			const [connected] = await requestAccounts(provider);
			if (!connected) throw new Error('No wallet account selected');
			if (connected.toLowerCase() !== wallet.address.toLowerCase()) {
				throw new Error(`Switch your wallet to ${wallet.address} and try again.`);
			}

			const challenge = await api.createWalletChallenge({
				address: wallet.address,
				username: viewer.username,
				chainId: wallet.chainId,
			});

			const signature = await personalSign(provider, { address: connected, message: challenge.message });

			const verified = await api.verifyWalletSignature({
				address: wallet.address,
				challengeId: challenge.id,
				message: challenge.message,
				signature,
			});

			if (!verified.verified) {
				throw new Error(verified.message || 'Wallet verification failed.');
			}

			const [nextViewer, nextWallets] = await Promise.all([api.fetchViewer(), api.fetchLinkedWallets()]);
			viewer = nextViewer;
			linkedWallets = nextWallets;

			const caipChainId =
				tipsConfig?.enabled && tipsConfig.chainId ? tipsConfig.chainId : wallet.chainId;
			const walletField = `eip155:${caipChainId}:${wallet.address}`;
			const existingFields = nextViewer.fields ?? [];
			const preservedFields = existingFields.filter((field) => {
				const name = field.name.trim().toLowerCase();
				return name !== 'wallet' && name !== 'ethereum';
			});

			viewer = await api.updateProfile({
				input: {
					fields: [...preservedFields, { name: 'Wallet', value: walletField }],
				},
			});

			tipWalletMessage = 'Tip wallet updated.';
		} catch (err) {
			tipsError = err instanceof Error ? err.message : String(err);
		} finally {
			isUpdatingTipWallet = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		pushController?.destroy();
		pushController = null;
		pushState = null;
		pushSetupError = null;
		isLoadingPush = false;

		if (!token) return;

		const adapter = getStreamingAdapter(token);
		if (!adapter) return;

		const abortController = new AbortController();
		let unsubscribe: (() => void) | null = null;
		let localController: PushNotificationsController | null = null;
		isLoadingPush = true;

		void (async () => {
			try {
				const vapidPublicKey = await api.fetchInstanceVapidKey({ signal: abortController.signal });
				if (abortController.signal.aborted) return;

				localController = new PushNotificationsController({
					adapter,
					vapidPublicKey,
					serviceWorkerPath: `${base}/sw.js`,
				});

				pushController = localController;
				unsubscribe = localController.subscribe((next) => {
					pushState = next;
					if (next.subscription) {
						pushAlerts = { ...next.subscription.alerts };
					}
				});

				await localController.initialize();
			} catch (err) {
				if (abortController.signal.aborted) return;
				pushSetupError = err instanceof Error ? err.message : String(err);
			} finally {
				if (!abortController.signal.aborted) {
					isLoadingPush = false;
				}
			}
		})();

		return () => {
			abortController.abort();
			unsubscribe?.();
			localController?.destroy();
		};
	});

	function updatePushAlert(key: keyof PushAlerts, value: boolean) {
		pushAlerts = { ...pushAlerts, [key]: value };
	}

	async function handleEnablePush() {
		if (!pushController) return;
		pushSetupError = null;

		try {
			await pushController.register(pushAlerts);
		} catch (err) {
			pushSetupError = err instanceof Error ? err.message : String(err);
		}
	}

	async function handleDisablePush() {
		if (!pushController) return;
		pushSetupError = null;

		try {
			await pushController.unregister();
		} catch (err) {
			pushSetupError = err instanceof Error ? err.message : String(err);
		}
	}

	async function handleSavePushAlerts() {
		if (!pushController) return;
		pushSetupError = null;

		try {
			await pushController.updateAlerts(pushAlerts);
		} catch (err) {
			pushSetupError = err instanceof Error ? err.message : String(err);
		}
	}

	async function handleProfileSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!$authSession?.accessToken) return;
		if (isSavingProfile) return;

		isSavingProfile = true;
		profileMessage = null;
		profileError = null;

		try {
			const next = await api.updateProfile({
				input: {
					displayName,
					bio,
					avatar,
					header,
				},
			});

			viewer = next;
			displayName = next.displayName ?? displayName;
			avatar = next.avatar ?? avatar;
			header = next.header ?? header;
			profileMessage = 'Profile updated.';
		} catch (err) {
			profileError = err instanceof Error ? err.message : String(err);
		} finally {
			isSavingProfile = false;
		}
	}

	function updateReblogFilter(key: string, enabled: boolean) {
		prefReblogFilters = prefReblogFilters.map((filter) =>
			filter.key === key ? { ...filter, enabled } : filter
		);
	}

	async function handlePreferencesSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!$authSession?.accessToken) return;
		if (isSavingPreferences) return;

		isSavingPreferences = true;
		preferencesMessage = null;
		preferencesError = null;

		try {
			const language = prefLanguage.trim();

			const next = await api.updateUserPreferences({
				input: {
					...(language.length > 0 ? { language } : {}),
					defaultPostingVisibility: prefVisibility,
					expandSpoilers: prefExpandSpoilers,
					expandMedia: prefExpandMedia,
					autoplayGifs: prefAutoplayGifs,
					directMessagesFrom: prefDirectMessagesFrom,
					reblogFilters: prefReblogFilters,
				},
			});

			prefLanguage = next.posting.defaultLanguage ?? prefLanguage;
			prefVisibility = next.posting.defaultVisibility;
			prefExpandSpoilers = next.reading.expandSpoilers;
			prefExpandMedia = next.reading.expandMedia;
			prefAutoplayGifs = next.reading.autoplayGifs;
			prefDirectMessagesFrom = next.privacy.directMessagesFrom;
			prefReblogFilters = next.reblogFilters.map((filter) => ({
				key: filter.key,
				enabled: filter.enabled,
			}));
			preferencesMessage = 'Preferences saved.';
		} catch (err) {
			preferencesError = err instanceof Error ? err.message : String(err);
		} finally {
			isSavingPreferences = false;
		}
	}
</script>

<svelte:head>
	<title>Settings • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Settings</h1>

	{#if !$authSession}
		<p>Sign in to manage your profile and preferences.</p>
	{:else if isLoading}
		<div class="page__notice">Loading settings…</div>
	{:else if loadError}
		<div class="page__notice page__notice--error" role="alert">{loadError}</div>
	{:else}
		{#if viewer}
			<p class="page__meta">
				Signed in as <strong>{viewer.displayName || viewer.username}</strong>
				<span class="page__handle">@{viewer.acct}</span>
			</p>
		{/if}

		<div class="settings">
			<section class="settings__section">
				<header class="settings__header">
					<h2 class="settings__title">Account</h2>
					<p class="settings__subtitle">Update display name, bio, and profile images.</p>
				</header>

				<form class="settings-form" onsubmit={handleProfileSubmit}>
					<div class="settings-form__grid">
						<label class="settings-field">
							<span class="settings-field__label">Display name</span>
							<input class="settings-field__input" type="text" bind:value={displayName} />
						</label>

						<label class="settings-field">
							<span class="settings-field__label">Avatar URL</span>
							<input class="settings-field__input" type="url" bind:value={avatar} />
						</label>

						<label class="settings-field">
							<span class="settings-field__label">Header URL</span>
							<input class="settings-field__input" type="url" bind:value={header} />
						</label>

						<label class="settings-field settings-field--full">
							<span class="settings-field__label">Bio</span>
							<textarea class="settings-field__textarea" rows={5} bind:value={bio}></textarea>
						</label>
					</div>

					{#if profileError}
						<div class="settings-form__notice settings-form__notice--error" role="alert">
							{profileError}
						</div>
					{:else if profileMessage}
						<div class="settings-form__notice">{profileMessage}</div>
					{/if}

					<div class="settings-form__actions">
						<button type="submit" class="gr-button gr-button--solid" disabled={isSavingProfile}>
							{isSavingProfile ? 'Saving…' : 'Save profile'}
						</button>
					</div>
				</form>
			</section>

			<section class="settings__section">
				<header class="settings__header">
					<h2 class="settings__title">Tipping</h2>
					<p class="settings__subtitle">Configure your public tip wallet and linked wallets.</p>
				</header>

				<div class="settings-form">
					<div class="settings-form__grid settings-form__grid--single">
						<div class="settings-field settings-field--full">
							<span class="settings-field__label">Instance tip config</span>
							{#if tipsConfig?.enabled && tipsConfig.chainId && tipsConfig.contractAddress}
								<div class="settings-form__notice">
									<div>
										<strong>Enabled</strong> on chain {tipsConfig.chainId}
									</div>
									<div>
										Contract <code>{tipsConfig.contractAddress}</code>
									</div>
								</div>
							{:else}
								<p class="settings-form__hint">Tipping is disabled on this instance.</p>
							{/if}
						</div>

						{#if viewer}
							<div class="settings-field settings-field--full">
								<span class="settings-field__label">Your tip address</span>
								{#if viewer.tipAddress && viewer.tipChainId}
									<div class="settings-form__notice">
										<code>{viewer.tipAddress}</code>
										<div class="settings-token__meta">Chain ID: {viewer.tipChainId}</div>
										<div class="settings-token__meta">
											Default is your most recently used linked wallet (login wallet).
										</div>
									</div>
								{:else}
									<p class="settings-form__hint">
										No tip address configured yet. Link a wallet and set it as your default.
									</p>
								{/if}
							</div>
						{:else}
							<p class="settings-form__hint">Unable to load viewer tip address.</p>
						{/if}
					</div>

					<div class="settings-form__subsection">
						<h3 class="settings-form__subtitle">Linked wallets</h3>

						{#if tipsError}
							<div class="settings-form__notice settings-form__notice--error" role="alert">
								{tipsError}
							</div>
						{:else if tipWalletMessage}
							<div class="settings-form__notice">{tipWalletMessage}</div>
						{/if}

						{#if linkedWallets.length === 0}
							<p class="settings-form__hint">
								No linked wallets found. Manage wallets in <a href="/auth/wallet">auth</a>.
							</p>
						{:else}
							<ul class="settings-list" aria-label="Linked wallets">
								{#each linkedWallets as wallet (wallet.id)}
									<li class="settings-list__item">
										<div class="settings-list__body">
											<div class="settings-list__title">
												<code>{wallet.address}</code>
												{#if defaultTipWallet && wallet.address === defaultTipWallet.address}
													<span class="settings-token__meta"> — Default</span>
												{/if}
											</div>
											<div class="settings-list__meta">
												Chain {wallet.chainId} · Last used {new Date(wallet.lastUsed).toLocaleString()}
											</div>
										</div>

										<div class="settings-form__actions settings-form__actions--between">
											<button
												type="button"
												class="gr-button gr-button--outline"
												onclick={() => handleSetDefaultTipWallet(wallet)}
												disabled={isUpdatingTipWallet}
											>
												{isUpdatingTipWallet ? 'Updating…' : 'Set default'}
											</button>
										</div>
									</li>
								{/each}
							</ul>
							<p class="settings-form__hint">
								To change your default tip wallet, switch accounts in your wallet extension and click
								“Set default”.
							</p>
						{/if}
					</div>
				</div>
			</section>

			<section class="settings__section">
				<header class="settings__header">
					<h2 class="settings__title">Preferences</h2>
					<p class="settings__subtitle">Default language, visibility, and content controls.</p>
				</header>

				<form class="settings-form" onsubmit={handlePreferencesSubmit}>
					<div class="settings-form__grid">
						<label class="settings-field">
							<span class="settings-field__label">Default language</span>
							<input class="settings-field__input" type="text" bind:value={prefLanguage} placeholder="en" />
						</label>

						<label class="settings-field">
							<span class="settings-field__label">Default visibility</span>
							<select class="settings-field__select" bind:value={prefVisibility}>
								<option value="PUBLIC">Public</option>
								<option value="UNLISTED">Unlisted</option>
								<option value="FOLLOWERS">Followers-only</option>
								<option value="DIRECT">Direct</option>
							</select>
						</label>

						<label class="settings-field">
							<span class="settings-field__label">Expand media</span>
							<select class="settings-field__select" bind:value={prefExpandMedia}>
								<option value="DEFAULT">Default</option>
								<option value="SHOW_ALL">Show all</option>
								<option value="HIDE_ALL">Hide all</option>
							</select>
						</label>

						<label class="settings-field settings-field--toggle">
							<span class="settings-field__label">Expand spoilers</span>
							<input class="settings-field__checkbox" type="checkbox" bind:checked={prefExpandSpoilers} />
						</label>

						<label class="settings-field settings-field--toggle">
							<span class="settings-field__label">Autoplay GIFs</span>
							<input class="settings-field__checkbox" type="checkbox" bind:checked={prefAutoplayGifs} />
						</label>

						<label class="settings-field">
							<span class="settings-field__label">Direct messages from</span>
							<select class="settings-field__select" bind:value={prefDirectMessagesFrom}>
								<option value="FOLLOWING_ONLY">People you follow</option>
								<option value="ANYONE">Anyone</option>
							</select>
						</label>
					</div>

					<div class="settings-form__subsection">
						<h3 class="settings-form__subtitle">Content filters</h3>
						{#if prefReblogFilters.length === 0}
							<p class="settings-form__hint">No filters available.</p>
						{:else}
							<div class="settings-filters">
								{#each prefReblogFilters as filter (filter.key)}
									<label class="settings-filter">
										<span class="settings-filter__label">{filter.key}</span>
										<input
											class="settings-filter__checkbox"
											type="checkbox"
											checked={filter.enabled}
											onchange={(event) =>
												updateReblogFilter(
													filter.key,
													(event.currentTarget as HTMLInputElement).checked
												)}
										/>
									</label>
								{/each}
							</div>
						{/if}
					</div>

					{#if preferencesError}
						<div class="settings-form__notice settings-form__notice--error" role="alert">
							{preferencesError}
						</div>
					{:else if preferencesMessage}
						<div class="settings-form__notice">{preferencesMessage}</div>
					{/if}

					<div class="settings-form__actions">
						<button type="submit" class="gr-button gr-button--solid" disabled={isSavingPreferences}>
							{isSavingPreferences ? 'Saving…' : 'Save preferences'}
						</button>
					</div>
				</form>
			</section>

			<section class="settings__section">
				<header class="settings__header">
					<h2 class="settings__title">Push notifications</h2>
					<p class="settings__subtitle">Receive notifications when the app is not open.</p>
				</header>

				{#if pushSetupError}
					<div class="settings-form__notice settings-form__notice--error" role="alert">
						{pushSetupError}
					</div>
				{:else if pushState?.error}
					<div class="settings-form__notice settings-form__notice--error" role="alert">
						{pushState.error}
					</div>
				{/if}

				{#if isLoadingPush}
					<div class="page__notice">Loading push notifications…</div>
				{:else if pushState && !pushState.supported}
					<p class="settings-form__hint">
						Push notifications are not supported in this browser (requires Service Workers + Push API).
					</p>
				{:else if pushState}
					<p class="settings-form__hint">
						Permission: <strong>{pushState.permission}</strong>
					</p>

					{#if pushState.subscription}
						<p class="settings-form__hint">Push notifications are enabled for this account.</p>

						<div class="settings-filters" aria-label="Push notification alerts">
							{#each pushAlertOptions as option (option.key)}
								<label class="settings-filter">
									<span class="settings-filter__label">{option.label}</span>
									<input
										class="settings-filter__checkbox"
										type="checkbox"
										checked={pushAlerts[option.key]}
										disabled={pushState.loading || pushState.registering}
										onchange={(event) =>
											updatePushAlert(
												option.key,
												(event.currentTarget as HTMLInputElement).checked
											)}
									/>
								</label>
							{/each}
						</div>

						<div class="settings-form__actions">
							<button
								type="button"
								class="gr-button gr-button--solid"
								onclick={handleSavePushAlerts}
								disabled={pushState.loading || pushState.registering}
							>
								Save alerts
							</button>
							<button
								type="button"
								class="gr-button gr-button--outline"
								onclick={handleDisablePush}
								disabled={pushState.loading || pushState.registering}
							>
								Disable
							</button>
						</div>
					{:else}
						<p class="settings-form__hint">
							Enable push notifications to receive alerts when you are not actively using the app.
						</p>

						<button
							type="button"
							class="gr-button gr-button--solid"
							onclick={handleEnablePush}
							disabled={pushState.registering}
						>
							{pushState.registering ? 'Enabling…' : 'Enable push notifications'}
						</button>
					{/if}
				{:else}
					<p class="settings-form__hint">Push notifications are not available.</p>
				{/if}
			</section>
		</div>
	{/if}
</section>
