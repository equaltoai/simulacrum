<script lang="ts">
	interface Props {
		token: string;
		configured: boolean;
		baseUrl?: string | null;
		note: string;
		conversationCount: number;
		lifecycleEventCount: number;
		selectedConversationId?: string | null;
		onSave?: (token: string) => Promise<void> | void;
		onClear?: () => Promise<void> | void;
		busy?: boolean;
	}

	let {
		token = '',
		configured = false,
		baseUrl = null,
		note,
		conversationCount = 0,
		lifecycleEventCount = 0,
		selectedConversationId = null,
		onSave,
		onClear,
		busy = false,
	}: Props = $props();

	let draft: string = $state('');

	$effect(() => {
		draft = token;
	});

	const hasBaseUrl = $derived(Boolean(baseUrl?.trim()));
	const workflowReady = $derived(Boolean(configured && hasBaseUrl));
	const badgeLabel = $derived(
		workflowReady ? 'Connected' : hasBaseUrl ? 'Token required' : 'Base URL required'
	);

	async function saveToken() {
		await onSave?.(draft.trim());
	}

	async function clearToken() {
		draft = '';
		await onClear?.();
	}
</script>

<section class="ft-panel">
	<header class="ft-panel__header">
		<div>
			<p class="ft-panel__eyebrow">Host workflow access</p>
			<h2>Control-plane token</h2>
		</div>
		<span class:ft-panel__badge--success={workflowReady} class="ft-panel__badge">
			{badgeLabel}
		</span>
	</header>

	<p class="ft-panel__copy">{note}</p>

	<div class="ft-panel__stats">
		<div>
			<strong>{conversationCount}</strong>
			<span>known conversations</span>
		</div>
		<div>
			<strong>{lifecycleEventCount}</strong>
			<span>lifecycle events</span>
		</div>
		<div>
			<strong>{selectedConversationId ? 'active' : 'idle'}</strong>
			<span>{selectedConversationId ?? 'no selected thread'}</span>
		</div>
	</div>

	<label class="ft-field">
		<span>Bearer token</span>
		<input
			bind:value={draft}
			autocomplete="off"
			placeholder="Paste lesser-host control-plane bearer token"
			type="password"
		/>
	</label>

	<div class="ft-panel__actions">
		<button class="ft-button ft-button--primary" disabled={busy || !draft.trim()} onclick={saveToken} type="button">
			{configured ? 'Update token' : 'Save token'}
		</button>
		<button class="ft-button" disabled={busy || !configured} onclick={clearToken} type="button">
			Clear token
		</button>
	</div>
</section>
