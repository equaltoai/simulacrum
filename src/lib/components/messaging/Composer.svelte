<!--
  Messages.Composer - Message Input
-->
<script lang="ts">
	import { createButton } from '$lib/greater/headless/button';
	import { getMessagesContext } from './context.svelte.js';

	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();

	const { state: messagesState, sendMessage } = getMessagesContext();

	function getDefaultLanguage(): string {
		if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
			return navigator.language.split(/[-_]/)[0]?.trim() ?? '';
		}

		return '';
	}

	const defaultLanguage = getDefaultLanguage();

	let content = $state('');
	let showOptions = $state(false);
	let cwEnabled = $state(false);
	let spoilerText = $state('');
	let sensitive = $state(false);
	let language = $state(defaultLanguage);

	const isPendingRequest = $derived(messagesState.selectedConversation?.requestState === 'PENDING');
	const normalizedSpoilerText = $derived.by(() => {
		const trimmed = spoilerText.trim();
		return cwEnabled && trimmed.length > 0 ? trimmed : undefined;
	});
	const normalizedLanguage = $derived.by(() => {
		const trimmed = language.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	});
	const optionsVisible = $derived(
		showOptions || cwEnabled || sensitive || language.trim() !== defaultLanguage
	);

	$effect(() => {
		if (!cwEnabled && spoilerText.length > 0) {
			spoilerText = '';
		}
	});

	const sendButton = createButton({
		onClick: () => handleSend(),
	});

	function toggleOptions() {
		showOptions = !showOptions;
	}

	async function handleSend() {
		if (!content.trim() || messagesState.loading || isPendingRequest) return;

		try {
			await sendMessage(content.trim(), {
				sensitive: sensitive || undefined,
				spoilerText: normalizedSpoilerText,
				language: normalizedLanguage,
			});
			content = '';
			cwEnabled = false;
			spoilerText = '';
			sensitive = false;
			showOptions = false;
		} catch {
			// Error handled by context
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	}
</script>

{#if messagesState.selectedConversation}
	<div class={`messages-composer ${className}`}>
		{#if optionsVisible}
			<div class="messages-composer__options">
				<div class="messages-composer__toggles">
					<label class="messages-composer__toggle">
						<input
							type="checkbox"
							bind:checked={cwEnabled}
							disabled={messagesState.loading || isPendingRequest}
						/>
						<span>Content warning</span>
					</label>
					<label class="messages-composer__toggle">
						<input
							type="checkbox"
							bind:checked={sensitive}
							disabled={messagesState.loading || isPendingRequest}
						/>
						<span>Sensitive</span>
					</label>
				</div>

				{#if cwEnabled}
					<input
						class="messages-composer__meta-input"
						bind:value={spoilerText}
						placeholder="Content warning (spoiler text)…"
						disabled={messagesState.loading || isPendingRequest}
						maxlength="500"
					/>
				{/if}

				<label class="messages-composer__field">
					<span class="messages-composer__field-label">Language</span>
					<input
						class="messages-composer__meta-input"
						bind:value={language}
						placeholder="en"
						disabled={messagesState.loading || isPendingRequest}
						maxlength="16"
						autocomplete="off"
						spellcheck="false"
					/>
				</label>
			</div>
		{/if}

		<textarea
			class="messages-composer__input"
			bind:value={content}
			onkeydown={handleKeyDown}
			placeholder={isPendingRequest ? 'Accept the request to reply…' : 'Write a message...'}
			disabled={messagesState.loading || isPendingRequest}
			rows="3"
		></textarea>
		<div class="messages-composer__actions">
			<button
				type="button"
				class="messages-composer__secondary"
				disabled={messagesState.loading || isPendingRequest}
				aria-expanded={optionsVisible}
				onclick={toggleOptions}
			>
				Options
			</button>
			<button
				use:sendButton.actions.button
				class="messages-composer__send"
				disabled={messagesState.loading || isPendingRequest || !content.trim()}
			>
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
				</svg>
				{messagesState.loading ? 'Sending...' : 'Send'}
			</button>
		</div>
	</div>
{/if}

<style>
	.messages-composer__options {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.messages-composer__toggles {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.messages-composer__toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.9rem;
		color: var(--gr-color-text-secondary);
	}

	.messages-composer__field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.messages-composer__field-label {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--gr-color-text-secondary);
	}

	.messages-composer__meta-input {
		width: 100%;
		border: 1px solid var(--gr-color-border);
		border-radius: 0.75rem;
		padding: 0.65rem 0.8rem;
		background: var(--gr-color-bg-elevated);
		color: var(--gr-color-text);
	}

	.messages-composer__meta-input:focus {
		outline: none;
		border-color: var(--gr-color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--gr-color-primary) 20%, transparent);
	}

	.messages-composer__actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
	}

	.messages-composer__secondary {
		border: 1px solid var(--gr-color-border);
		border-radius: 999px;
		padding: 0.55rem 0.95rem;
		background: transparent;
		color: var(--gr-color-text-secondary);
		font-weight: 600;
	}

	.messages-composer__secondary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.messages-composer__actions {
			flex-direction: column;
			align-items: stretch;
		}

		.messages-composer__secondary,
		.messages-composer__send {
			width: 100%;
			justify-content: center;
		}
	}
</style>
