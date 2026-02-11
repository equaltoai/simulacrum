<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { api } from '$lib/api';
	import MediaComposer, { type MediaComposerAttachment } from '$lib/patterns/MediaComposer.svelte';
	import CustomEmojiPicker, { type CustomEmoji } from '$lib/patterns/CustomEmojiPicker.svelte';
	import type { Status } from '$lib/types';
	import type { UploadMediaInput, Visibility } from '$lib/greater/adapters/graphql';

	type Mode = 'post' | 'reply' | 'quote' | 'edit';

	type ComposerAttachment = MediaComposerAttachment & {
		serverId?: string;
	};

	interface Props {
		mode?: Mode;
		inReplyToId?: string;
		quoteId?: string;
		editId?: string;
		initialContent?: string;
		initialSpoilerText?: string;
		initialSensitive?: boolean;
		initialVisibility?: Visibility;
		autofocus?: boolean;
		onSubmitted?: (status: Status) => void;
		onCancel?: () => void;
		class?: string;
	}

	let {
		mode = 'post',
		inReplyToId,
		quoteId,
		editId,
		initialContent = '',
		initialSpoilerText = '',
		initialSensitive = false,
		initialVisibility = 'PUBLIC',
		autofocus = false,
		onSubmitted,
		onCancel,
		class: className = '',
	}: Props = $props();

	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	let content = $state(untrack(() => initialContent));
	let visibility = $state<Visibility>(untrack(() => initialVisibility));
	let cwEnabled = $state(untrack(() => initialSpoilerText.trim().length > 0));
	let spoilerText = $state(untrack(() => initialSpoilerText));
	let sensitive = $state(untrack(() => Boolean(initialSensitive)));

	let attachments = $state<ComposerAttachment[]>([]);

	let pollEnabled = $state(false);
	let pollOptions = $state<string[]>(['', '']);
	let pollExpiresIn = $state(86400);
	let pollMultiple = $state(false);
	let pollHideTotals = $state(false);

	let emojiOpen = $state(false);
	let emojisLoading = $state(false);
	let emojiError = $state<string | null>(null);
	let emojis = $state<CustomEmoji[]>([]);
	let recentEmojis = $state<string[]>([]);
	let favoriteEmojis = $state<string[]>([]);

	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	const supportsAttachments = $derived(mode !== 'edit');
	const supportsPolls = $derived(mode !== 'edit');

	const title = $derived(
		mode === 'reply' ? 'Reply' : mode === 'quote' ? 'Quote' : mode === 'edit' ? 'Edit post' : 'Compose'
	);
	const submitLabel = $derived(
		mode === 'reply' ? 'Reply' : mode === 'quote' ? 'Quote' : mode === 'edit' ? 'Save' : 'Post'
	);

	function mapAttachmentCategory(type: ComposerAttachment['type']): UploadMediaInput['mediaType'] {
		switch (type) {
			case 'image':
				return 'IMAGE';
			case 'video':
				return 'VIDEO';
			case 'audio':
				return 'AUDIO';
			case 'gifv':
				return 'GIFV';
			default:
				return null;
		}
	}

	function safeParseJson<T>(value: string | null): T | null {
		if (!value) return null;
		try {
			return JSON.parse(value) as T;
		} catch {
			return null;
		}
	}

	function loadEmojiPrefs() {
		if (typeof localStorage === 'undefined') return;
		recentEmojis = safeParseJson<string[]>(localStorage.getItem('simulacrum:emoji:recent')) ?? [];
		favoriteEmojis = safeParseJson<string[]>(localStorage.getItem('simulacrum:emoji:favorites')) ?? [];
	}

	function saveEmojiPrefs() {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem('simulacrum:emoji:recent', JSON.stringify(recentEmojis.slice(0, 50)));
		localStorage.setItem('simulacrum:emoji:favorites', JSON.stringify(favoriteEmojis.slice(0, 200)));
	}

	onMount(() => {
		loadEmojiPrefs();
		if (autofocus) {
			queueMicrotask(() => textareaEl?.focus());
		}
	});

	async function ensureEmojisLoaded() {
		if (emojisLoading || emojis.length > 0) return;

		emojisLoading = true;
		emojiError = null;
		try {
			const payload = await api.fetchCustomEmojis();
			emojis = payload.map((emoji) => ({
				shortcode: emoji.shortcode,
				url: emoji.url,
				staticUrl: emoji.staticUrl,
				category: emoji.category ?? undefined,
				visibleInPicker: emoji.visibleInPicker,
			}));
		} catch (err) {
			emojiError = err instanceof Error ? err.message : String(err);
		} finally {
			emojisLoading = false;
		}
	}

	function toggleEmojiPicker() {
		emojiOpen = !emojiOpen;
		if (emojiOpen) {
			void ensureEmojisLoaded();
		}
	}

	function insertAtCursor(text: string) {
		if (!textareaEl) {
			content = `${content}${text}`;
			return;
		}

		const start = textareaEl.selectionStart ?? content.length;
		const end = textareaEl.selectionEnd ?? content.length;
		const before = content.slice(0, start);
		const after = content.slice(end);
		const next = `${before}${text}${after}`;
		content = next;

		queueMicrotask(() => {
			if (!textareaEl) return;
			const cursor = start + text.length;
			textareaEl.focus();
			textareaEl.setSelectionRange(cursor, cursor);
		});
	}

	function onEmojiSelect(emoji: CustomEmoji) {
		const shortcode = emoji.shortcode.trim();
		if (!shortcode) return;

		insertAtCursor(`:${shortcode}:`);
		recentEmojis = [shortcode, ...recentEmojis.filter((value) => value !== shortcode)].slice(0, 50);
		saveEmojiPrefs();
	}

	function onEmojiToggleFavorite(shortcode: string, isFavorite: boolean) {
		if (isFavorite) {
			favoriteEmojis = [shortcode, ...favoriteEmojis.filter((value) => value !== shortcode)].slice(0, 200);
		} else {
			favoriteEmojis = favoriteEmojis.filter((value) => value !== shortcode);
		}
		saveEmojiPrefs();
	}

	function cleanupAttachmentUrls(attachment: ComposerAttachment) {
		const urls = [attachment.url, attachment.previewUrl].filter(Boolean) as string[];
		for (const url of urls) {
			if (url.startsWith('blob:')) {
				URL.revokeObjectURL(url);
			}
		}
	}

	function clearAttachments() {
		for (const attachment of attachments) cleanupAttachmentUrls(attachment);
		attachments = [];
	}

	function togglePollEnabled() {
		if (!supportsPolls) return;
		const next = !pollEnabled;
		pollEnabled = next;
		error = null;
		if (pollEnabled && attachments.length > 0) {
			clearAttachments();
		}
	}

	async function handleAddAttachments(files: File[]): Promise<ComposerAttachment[]> {
		if (!supportsAttachments || pollEnabled) return [];

		const now = Date.now();
		return files.map((file, index) => {
			const url = URL.createObjectURL(file);
			const type: ComposerAttachment['type'] =
				file.type.startsWith('image/')
					? file.type === 'image/gif'
						? 'gifv'
						: 'image'
					: file.type.startsWith('video/')
						? 'video'
						: file.type.startsWith('audio/')
							? 'audio'
							: 'unknown';

			return {
				id: `local-${now}-${index}-${Math.random().toString(16).slice(2)}`,
				type,
				url,
				previewUrl: url,
				file,
				uploaded: false,
				uploadProgress: 0,
			};
		});
	}

	function handleRemoveAttachment(id: string) {
		const attachment = attachments.find((item) => item.id === id);
		if (attachment) cleanupAttachmentUrls(attachment);
	}

	function normalizePollDraft(): { ok: boolean; errors: string[]; options: string[] } {
		const options = pollOptions.map((value) => value.trim()).filter((value) => value.length > 0);
		const errors: string[] = [];

		if (!pollEnabled) return { ok: true, errors, options: [] };

		if (options.length < 2) errors.push('Polls require at least 2 options.');
		if (options.length > 4) errors.push('Polls support up to 4 options.');
		if (pollExpiresIn < 60) errors.push('Poll duration must be at least 1 minute.');

		return { ok: errors.length === 0, errors, options };
	}

	const canSubmit = $derived.by(() => {
		if (isSubmitting) return false;
		if (mode === 'edit' && !editId) return false;
		if (mode === 'quote' && !quoteId) return false;
		if (mode === 'reply' && !inReplyToId) return false;

		const trimmedContent = content.trim();
		const hasContent = trimmedContent.length > 0;
		const hasAttachments = attachments.length > 0;
		const hasPoll = pollEnabled;

		if (mode === 'edit') {
			return hasContent;
		}

		if (hasPoll) {
			const poll = normalizePollDraft();
			return poll.ok && (hasContent || poll.options.length > 0);
		}

		return hasContent || hasAttachments;
	});

	async function uploadAttachment(attachment: ComposerAttachment): Promise<string> {
		if (!attachment.file) {
			throw new Error('Attachment missing file reference');
		}

		const localPreviewUrls = [attachment.url, attachment.previewUrl].filter(Boolean) as string[];

		const localId = attachment.id;
		const update = (partial: Partial<ComposerAttachment>) => {
			attachments = attachments.map((item) => (item.id === localId ? { ...item, ...partial } : item));
		};

		update({ uploaded: false, uploadProgress: 0, error: undefined });

		let progress = 0;
		const progressInterval = setInterval(() => {
			progress = Math.min(progress + 10, 90);
			update({ uploadProgress: progress });
		}, 120);

		try {
			const payload = await api.uploadMedia({
				input: {
					file: attachment.file,
					filename: attachment.file.name,
					description: attachment.description?.trim() ? attachment.description.trim() : undefined,
					focus: attachment.meta?.focus,
					sensitive,
					spoilerText: cwEnabled ? spoilerText.trim() || null : null,
					mediaType: mapAttachmentCategory(attachment.type),
				},
			});

			clearInterval(progressInterval);
			update({
				uploaded: true,
				uploadProgress: 100,
				serverId: payload.media.id,
				url: payload.media.url,
				previewUrl: payload.media.previewUrl ?? payload.media.url,
			});

			for (const url of localPreviewUrls) {
				if (url.startsWith('blob:')) {
					URL.revokeObjectURL(url);
				}
			}

			if (payload.warnings && payload.warnings.length > 0) {
				console.warn('[Composer] Media upload warnings', payload.warnings);
			}

			return payload.media.id;
		} catch (err) {
			clearInterval(progressInterval);
			update({
				uploaded: false,
				error: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	}

	function resetDraft() {
		content = '';
		visibility = 'PUBLIC';
		cwEnabled = false;
		spoilerText = '';
		sensitive = false;
		clearAttachments();
		pollEnabled = false;
		pollOptions = ['', ''];
		pollExpiresIn = 86400;
		pollMultiple = false;
		pollHideTotals = false;
		emojiOpen = false;
		error = null;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSubmit) return;

		isSubmitting = true;
		error = null;

		try {
			const trimmedSpoilerText = spoilerText.trim();
			const spoiler = cwEnabled && trimmedSpoilerText.length > 0 ? trimmedSpoilerText : undefined;

			if (mode === 'edit') {
				const updated = await api.updateStatus({
					id: editId as string,
					input: {
						content: content.trim(),
						...(typeof spoiler === 'string' ? { spoilerText: spoiler } : {}),
						sensitive,
					},
				});

				onSubmitted?.(updated);
				onCancel?.();
				return;
			}

			let attachmentIds: string[] | undefined;
			if (supportsAttachments && attachments.length > 0) {
				attachmentIds = [];
				for (const attachment of attachments) {
					attachmentIds.push(await uploadAttachment(attachment));
				}
			}

			let pollInput: NonNullable<Parameters<typeof api.createNote>[0]['poll']> | undefined;
			if (supportsPolls && pollEnabled) {
				const poll = normalizePollDraft();
				if (!poll.ok) {
					throw new Error(poll.errors[0] ?? 'Invalid poll');
				}

				pollInput = {
					options: poll.options,
					expiresIn: pollExpiresIn,
					multiple: pollMultiple,
					hideTotals: pollHideTotals,
				};
			}

			const status = await api.createNote({
				content: content.trim(),
				visibility,
				inReplyToId: mode === 'reply' ? inReplyToId : undefined,
				quoteId: mode === 'quote' ? quoteId : undefined,
				poll: pollInput,
				sensitive,
				spoilerText: spoiler,
				attachmentIds,
			});

			onSubmitted?.(status);
			resetDraft();
			onCancel?.();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isSubmitting = false;
		}
	}

	function addPollOption() {
		if (pollOptions.length >= 4) return;
		pollOptions = [...pollOptions, ''];
	}

	function removePollOption(index: number) {
		if (pollOptions.length <= 2) return;
		pollOptions = pollOptions.filter((_, i) => i !== index);
	}
</script>

<form class={`compose composer ${className}`} onsubmit={handleSubmit}>
	<h2 class="compose__label composer__title">{title}</h2>

	{#if supportsPolls}
		<div class="composer__toggles">
			<label class="composer__toggle">
				<input type="checkbox" bind:checked={cwEnabled} disabled={isSubmitting} />
				<span>Content warning</span>
			</label>
			<label class="composer__toggle">
				<input type="checkbox" bind:checked={sensitive} disabled={isSubmitting} />
				<span>Sensitive</span>
			</label>
			<label class="composer__toggle">
				<input
					type="checkbox"
					checked={pollEnabled}
					onchange={togglePollEnabled}
					disabled={isSubmitting || attachments.length > 0}
				/>
				<span>Poll</span>
			</label>
			<label class="composer__field">
				<span class="composer__field-label">Visibility</span>
				<select class="composer__select" bind:value={visibility} disabled={isSubmitting}>
					<option value="PUBLIC">Public</option>
					<option value="UNLISTED">Unlisted</option>
					<option value="FOLLOWERS">Followers</option>
					<option value="DIRECT">Direct</option>
				</select>
			</label>
		</div>
	{/if}

	{#if cwEnabled}
		<input
			class="composer__cw"
			placeholder="Content warning (spoiler text)…"
			autocomplete="off"
			bind:value={spoilerText}
			disabled={isSubmitting}
		/>
	{/if}

	<div class="composer__editor">
		<textarea
			bind:this={textareaEl}
			class="compose__input composer__textarea"
			placeholder={mode === 'reply'
				? 'Write a reply…'
				: mode === 'quote'
					? 'Add your commentary…'
					: mode === 'edit'
						? 'Update your post…'
						: 'What’s happening?'}
			autocomplete="off"
			rows={4}
			bind:value={content}
			disabled={isSubmitting}
		></textarea>

		<div class="composer__toolbar">
			<button
				type="button"
				class="gr-button gr-button--outline"
				onclick={toggleEmojiPicker}
				disabled={isSubmitting}
			>
				Emoji
			</button>
		</div>

		{#if emojiOpen}
			<div class="composer__emoji-popover" role="dialog" aria-label="Emoji picker">
				{#if emojisLoading}
					<div class="composer__emoji-loading">Loading emojis…</div>
				{:else if emojiError}
					<div class="composer__emoji-error" role="alert">{emojiError}</div>
				{:else}
					<CustomEmojiPicker
						emojis={emojis}
						recentEmojis={recentEmojis}
						favoriteEmojis={favoriteEmojis}
						config={{ mode: 'inline', showRecent: true, showFavorites: true }}
						handlers={{ onSelect: onEmojiSelect, onToggleFavorite: onEmojiToggleFavorite }}
					/>
				{/if}
			</div>
		{/if}
	</div>

	{#if supportsAttachments && !pollEnabled}
		<MediaComposer
			bind:attachments
			config={{ maxAttachments: 4, enableFocalPoint: true, enableDragDrop: true, requireAltText: false }}
			handlers={{
				onUpload: handleAddAttachments,
				onRemove: handleRemoveAttachment,
			}}
		/>
	{:else if pollEnabled && attachments.length > 0}
		<div class="composer__note">Attachments removed because polls and media can’t be combined.</div>
	{/if}

	{#if supportsPolls && pollEnabled}
		<div class="composer__poll" role="group" aria-label="Poll">
			<div class="composer__poll-options">
				{#each pollOptions as option, index (index)}
					<div class="composer__poll-option">
						<input
							class="composer__poll-input"
							placeholder={`Option ${index + 1}`}
							autocomplete="off"
							value={option}
							disabled={isSubmitting}
							oninput={(e) => {
								const value = e.currentTarget.value;
								pollOptions = pollOptions.map((v, i) => (i === index ? value : v));
							}}
						/>
						{#if pollOptions.length > 2}
							<button
								type="button"
								class="composer__poll-remove"
								onclick={() => removePollOption(index)}
								disabled={isSubmitting}
							>
								Remove
							</button>
						{/if}
					</div>
				{/each}
			</div>

			<div class="composer__poll-actions">
				<button
					type="button"
					class="gr-button gr-button--outline"
					onclick={addPollOption}
					disabled={isSubmitting || pollOptions.length >= 4}
				>
					Add option
				</button>

				<label class="composer__field">
					<span class="composer__field-label">Poll length</span>
					<select class="composer__select" bind:value={pollExpiresIn} disabled={isSubmitting}>
						<option value={300}>5 minutes</option>
						<option value={1800}>30 minutes</option>
						<option value={3600}>1 hour</option>
						<option value={21600}>6 hours</option>
						<option value={86400}>1 day</option>
						<option value={259200}>3 days</option>
						<option value={604800}>7 days</option>
					</select>
				</label>

				<label class="composer__toggle">
					<input type="checkbox" bind:checked={pollMultiple} disabled={isSubmitting} />
					<span>Multiple choice</span>
				</label>
				<label class="composer__toggle">
					<input type="checkbox" bind:checked={pollHideTotals} disabled={isSubmitting} />
					<span>Hide totals</span>
				</label>
			</div>
		</div>
	{/if}

	<div class="compose__actions">
		{#if error}
			<span class="compose__error" role="alert">{error}</span>
		{/if}

		{#if onCancel}
			<button type="button" class="gr-button gr-button--outline" onclick={onCancel} disabled={isSubmitting}>
				Cancel
			</button>
		{/if}

		<button type="submit" class="gr-button gr-button--solid" disabled={!canSubmit}>
			{isSubmitting ? 'Working…' : submitLabel}
		</button>
	</div>
</form>

<style>
	.composer__toggles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gr-spacing-scale-3);
		align-items: center;
	}

	.composer__toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--gr-spacing-scale-2);
		font-size: var(--gr-typography-fontSize-sm);
		color: var(--gr-semantic-foreground-secondary);
	}

	.composer__field {
		display: inline-flex;
		align-items: center;
		gap: var(--gr-spacing-scale-2);
	}

	.composer__field-label {
		font-size: var(--gr-typography-fontSize-sm);
		color: var(--gr-semantic-foreground-secondary);
	}

	.composer__select {
		border: 1px solid var(--gr-semantic-border-default);
		border-radius: var(--gr-radii-lg);
		padding: var(--gr-spacing-scale-2) var(--gr-spacing-scale-3);
		background: var(--gr-semantic-background-base);
		color: var(--gr-semantic-foreground-primary);
		font: inherit;
	}

	.composer__cw {
		padding: var(--gr-spacing-scale-3) var(--gr-spacing-scale-4);
		border-radius: var(--gr-radii-lg);
		border: 1px solid var(--gr-semantic-border-default);
		background: var(--gr-semantic-background-base);
		color: var(--gr-semantic-foreground-primary);
		font: inherit;
	}

	.composer__editor {
		display: flex;
		flex-direction: column;
		gap: var(--gr-spacing-scale-3);
		position: relative;
	}

	.composer__toolbar {
		display: flex;
		gap: var(--gr-spacing-scale-3);
		align-items: center;
		justify-content: flex-start;
	}

	.composer__emoji-popover {
		border: 1px solid var(--gr-semantic-border-default);
		border-radius: var(--gr-radii-xl);
		background: var(--gr-semantic-background-surface);
		padding: var(--gr-spacing-scale-4);
	}

	.composer__emoji-loading,
	.composer__emoji-error {
		font-size: var(--gr-typography-fontSize-sm);
		color: var(--gr-semantic-foreground-secondary);
	}

	.composer__poll {
		display: flex;
		flex-direction: column;
		gap: var(--gr-spacing-scale-3);
		padding: var(--gr-spacing-scale-4);
		border-radius: var(--gr-radii-xl);
		border: 1px solid var(--gr-semantic-border-default);
		background: var(--gr-semantic-background-secondary);
	}

	.composer__poll-options {
		display: flex;
		flex-direction: column;
		gap: var(--gr-spacing-scale-2);
	}

	.composer__poll-option {
		display: flex;
		gap: var(--gr-spacing-scale-3);
		align-items: center;
	}

	.composer__poll-input {
		flex: 1;
		padding: var(--gr-spacing-scale-3) var(--gr-spacing-scale-4);
		border-radius: var(--gr-radii-lg);
		border: 1px solid var(--gr-semantic-border-default);
		background: var(--gr-semantic-background-base);
		color: var(--gr-semantic-foreground-primary);
		font: inherit;
	}

	.composer__poll-remove {
		border: 1px solid var(--gr-semantic-border-default);
		border-radius: var(--gr-radii-lg);
		padding: var(--gr-spacing-scale-2) var(--gr-spacing-scale-3);
		background: transparent;
		color: var(--gr-semantic-foreground-secondary);
		cursor: pointer;
		font: inherit;
	}

	.composer__poll-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gr-spacing-scale-3);
		align-items: center;
	}

	.composer__note {
		font-size: var(--gr-typography-fontSize-sm);
		color: var(--gr-semantic-foreground-secondary);
	}
</style>
