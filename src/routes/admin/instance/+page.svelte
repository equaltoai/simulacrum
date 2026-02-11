<script lang="ts">
	import { api, type AdminDomainBlock, type AdminDomainAllow, type AdminEmailDomainBlock, type Announcement } from '$lib/api';
	import { GraphQLRequestError } from '$lib/api/graphql';
	import { authSession } from '$lib/auth/session';

	type CustomEmoji = Awaited<ReturnType<typeof api.fetchCustomEmojis>>[number];

	function isAuthzError(err: unknown): boolean {
		if (!(err instanceof GraphQLRequestError)) return false;
		if (err.status === 401 || err.status === 403) return true;
		const message = err.message.toLowerCase();
		return message.includes('forbidden') || message.includes('unauthorized') || message.includes('not authorized');
	}

	let section = $state<'domains' | 'announcements' | 'emojis'>('domains');

	// Shared
	let isForbidden = $state(false);
	let error = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let isBusy = $state(false);

	// Domains
	let allows = $state<AdminDomainAllow[]>([]);
	let blocks = $state<AdminDomainBlock[]>([]);
	let emailBlocks = $state<AdminEmailDomainBlock[]>([]);
	let isLoadingDomains = $state(false);

	let allowDomain = $state('');

	let blockDomain = $state('');
	let blockSeverity = $state('silence');
	let blockRejectMedia = $state(false);
	let blockRejectReports = $state(false);
	let blockObfuscate = $state(false);
	let blockPrivateComment = $state('');
	let blockPublicComment = $state('');
	let editingBlockId = $state<string | null>(null);

	let emailBlockDomain = $state('');

	// Announcements
	let announcements = $state<Announcement[]>([]);
	let isLoadingAnnouncements = $state(false);
	let announcementText = $state('');
	let announcementAllDay = $state(false);
	let announcementStartsAt = $state('');
	let announcementEndsAt = $state('');
	let reactionDrafts = $state<Record<string, string>>({});

	// Emojis
	let emojis = $state<CustomEmoji[]>([]);
	let isLoadingEmojis = $state(false);
	let emojiShortcode = $state('');
	let emojiCategory = $state('');
	let emojiVisibleInPicker = $state(true);
	let emojiImageUrl = $state('');
	let emojiImageFile = $state<File | null>(null);
	let emojiEdits = $state<Record<string, { category: string; visibleInPicker: boolean }>>({});

	function resetBlockForm() {
		editingBlockId = null;
		blockDomain = '';
		blockSeverity = 'silence';
		blockRejectMedia = false;
		blockRejectReports = false;
		blockObfuscate = false;
		blockPrivateComment = '';
		blockPublicComment = '';
	}

	async function refreshDomains(signal?: AbortSignal) {
		error = null;
		actionError = null;
		isForbidden = false;
		isLoadingDomains = true;

		try {
			const [allowsResult, blocksResult, emailBlocksResult] = await Promise.all([
				api.fetchAdminDomainAllows({ first: 100, signal }),
				api.fetchAdminDomainBlocks({ first: 100, signal }),
				api.fetchAdminEmailDomainBlocks({ first: 100, signal }),
			]);
			allows = allowsResult.allows;
			blocks = blocksResult.blocks;
			emailBlocks = emailBlocksResult.blocks;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (isAuthzError(err)) {
				isForbidden = true;
				return;
			}
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isLoadingDomains = false;
		}
	}

	async function handleAddAllow() {
		if (!allowDomain.trim() || isBusy) return;
		isBusy = true;
		actionError = null;

		try {
			await api.adminCreateDomainAllow({ domain: allowDomain.trim() });
			allowDomain = '';
			await refreshDomains();
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isBusy = false;
		}
	}

	async function handleDeleteAllow(id: string) {
		if (isBusy) return;
		if (!confirm('Delete this domain allow?')) return;
		isBusy = true;
		actionError = null;

		try {
			await api.adminDeleteDomainAllow({ id });
			await refreshDomains();
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isBusy = false;
		}
	}

	function startEditBlock(block: AdminDomainBlock) {
		editingBlockId = block.id;
		blockDomain = block.domain;
		blockSeverity = block.severity;
		blockRejectMedia = block.rejectMedia;
		blockRejectReports = block.rejectReports;
		blockObfuscate = block.obfuscate;
		blockPrivateComment = block.privateComment ?? '';
		blockPublicComment = block.publicComment ?? '';
	}

	async function handleSaveBlock() {
		if (!blockDomain.trim() || isBusy) return;
		isBusy = true;
		actionError = null;

		try {
			const input = {
				...(editingBlockId ? {} : { domain: blockDomain.trim() }),
				severity: blockSeverity,
				rejectMedia: blockRejectMedia,
				rejectReports: blockRejectReports,
				obfuscate: blockObfuscate,
				privateComment: blockPrivateComment.trim() || undefined,
				publicComment: blockPublicComment.trim() || undefined,
			};

			if (editingBlockId) {
				await api.adminUpdateDomainBlock({ id: editingBlockId, input });
			} else {
				await api.adminCreateDomainBlock({ input: { domain: blockDomain.trim(), ...input } });
			}

			resetBlockForm();
			await refreshDomains();
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isBusy = false;
		}
	}

	async function handleDeleteBlock(id: string) {
		if (isBusy) return;
		if (!confirm('Delete this domain block?')) return;
		isBusy = true;
		actionError = null;

		try {
			await api.adminDeleteDomainBlock({ id });
			await refreshDomains();
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isBusy = false;
		}
	}

	async function handleAddEmailBlock() {
		if (!emailBlockDomain.trim() || isBusy) return;
		isBusy = true;
		actionError = null;

		try {
			await api.adminCreateEmailDomainBlock({ domain: emailBlockDomain.trim() });
			emailBlockDomain = '';
			await refreshDomains();
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isBusy = false;
		}
	}

	async function handleDeleteEmailBlock(id: string) {
		if (isBusy) return;
		if (!confirm('Delete this email domain block?')) return;
		isBusy = true;
		actionError = null;

		try {
			await api.adminDeleteEmailDomainBlock({ id });
			await refreshDomains();
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isBusy = false;
		}
	}

	async function refreshAnnouncements(signal?: AbortSignal) {
		error = null;
		actionError = null;
		isForbidden = false;
		isLoadingAnnouncements = true;

		try {
			announcements = await api.fetchAnnouncements({ signal });
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (isAuthzError(err)) {
				isForbidden = true;
				return;
			}
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isLoadingAnnouncements = false;
		}
	}

	function parseDateTimeLocal(value: string): string | undefined {
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const parsed = new Date(trimmed);
		if (Number.isNaN(parsed.getTime())) return undefined;
		return parsed.toISOString();
	}

	async function handleCreateAnnouncement() {
		if (!announcementText.trim() || isBusy) return;
		isBusy = true;
		actionError = null;

		try {
			await api.adminCreateAnnouncement({
				input: {
					text: announcementText.trim(),
					allDay: announcementAllDay || undefined,
					startsAt: parseDateTimeLocal(announcementStartsAt),
					endsAt: parseDateTimeLocal(announcementEndsAt),
				},
			});

			announcementText = '';
			announcementAllDay = false;
			announcementStartsAt = '';
			announcementEndsAt = '';

			await refreshAnnouncements();
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isBusy = false;
		}
	}

	async function toggleAnnouncementReaction(announcementId: string, name: string, me: boolean) {
		if (!name.trim() || isBusy) return;
		isBusy = true;
		actionError = null;

		try {
			if (me) {
				await api.removeAnnouncementReaction({ id: announcementId, name });
			} else {
				await api.addAnnouncementReaction({ id: announcementId, name });
			}
			await refreshAnnouncements();
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isBusy = false;
		}
	}

	async function refreshEmojis(signal?: AbortSignal) {
		error = null;
		actionError = null;
		isForbidden = false;
		isLoadingEmojis = true;

		try {
			emojis = await api.fetchCustomEmojis({ signal });
			const next: Record<string, { category: string; visibleInPicker: boolean }> = {};
			for (const emoji of emojis) {
				next[emoji.shortcode] = { category: emoji.category ?? '', visibleInPicker: emoji.visibleInPicker };
			}
			emojiEdits = next;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (isAuthzError(err)) {
				isForbidden = true;
				return;
			}
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isLoadingEmojis = false;
		}
	}

	function fileToDataUrl(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(new Error('Failed to read file'));
			reader.readAsDataURL(file);
		});
	}

	async function handleCreateEmoji() {
		if (!emojiShortcode.trim() || isBusy) return;

		const image =
			emojiImageFile ? await fileToDataUrl(emojiImageFile) : emojiImageUrl.trim() || null;

		if (!image) {
			actionError = 'Provide an image URL or upload a file.';
			return;
		}

		isBusy = true;
		actionError = null;

		try {
			await api.createEmoji({
				input: {
					shortcode: emojiShortcode.trim(),
					image,
					category: emojiCategory.trim() || undefined,
					visibleInPicker: emojiVisibleInPicker,
				},
			});

			emojiShortcode = '';
			emojiCategory = '';
			emojiVisibleInPicker = true;
			emojiImageUrl = '';
			emojiImageFile = null;

			await refreshEmojis();
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isBusy = false;
		}
	}

	async function handleUpdateEmoji(shortcode: string) {
		if (isBusy) return;
		isBusy = true;
		actionError = null;

		try {
			const edit = emojiEdits[shortcode];
			await api.updateEmoji({
				shortcode,
				input: {
					category: edit.category.trim() || undefined,
					visibleInPicker: edit.visibleInPicker,
				},
			});
			await refreshEmojis();
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isBusy = false;
		}
	}

	async function handleDeleteEmoji(shortcode: string) {
		if (isBusy) return;
		if (!confirm(`Delete emoji :${shortcode}: ?`)) return;
		isBusy = true;
		actionError = null;

		try {
			await api.deleteEmoji({ shortcode });
			await refreshEmojis();
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isBusy = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		if (!token) {
			isForbidden = false;
			error = null;
			actionError = null;
			isBusy = false;
			allows = [];
			blocks = [];
			emailBlocks = [];
			announcements = [];
			emojis = [];
			emojiEdits = {};
		}
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		if (!token) return;

		section;
		const controller = new AbortController();

		if (section === 'domains') {
			void refreshDomains(controller.signal);
		}
		if (section === 'announcements') {
			void refreshAnnouncements(controller.signal);
		}
		if (section === 'emojis') {
			void refreshEmojis(controller.signal);
		}

		return () => controller.abort();
	});
</script>

<svelte:head>
	<title>Admin • Instance • Simulacrum</title>
</svelte:head>

<div class="admin-surface">
	<div class="admin-surface__header">
		<h2 class="admin-surface__title">Instance</h2>
	</div>

	<div class="tabs" aria-label="Instance sections">
		<button
			type="button"
			class={`tabs__tab ${section === 'domains' ? 'is-active' : ''}`}
			onclick={() => (section = 'domains')}
		>
			Domains
		</button>
		<button
			type="button"
			class={`tabs__tab ${section === 'announcements' ? 'is-active' : ''}`}
			onclick={() => (section = 'announcements')}
		>
			Announcements
		</button>
		<button
			type="button"
			class={`tabs__tab ${section === 'emojis' ? 'is-active' : ''}`}
			onclick={() => (section = 'emojis')}
		>
			Custom emojis
		</button>
	</div>

	{#if actionError}
		<div class="page__notice page__notice--error" role="alert">{actionError}</div>
	{/if}

	{#if isForbidden}
		<div class="page__notice page__notice--error" role="alert">
			You don’t have permission to access these admin tools on this instance.
		</div>
	{:else if error}
		<div class="page__notice page__notice--error" role="alert">{error}</div>
	{/if}

	{#if section === 'domains'}
		{#if isLoadingDomains}
			<div class="page__notice">Loading domain settings…</div>
		{:else}
			<div class="admin-grid-2">
				<div class="admin-panel">
					<h3>Domain allows</h3>
					<div class="admin-inline-form">
						<input type="text" bind:value={allowDomain} placeholder="example.com" />
						<button type="button" class="gr-button gr-button--solid" onclick={handleAddAllow} disabled={isBusy}>
							Add
						</button>
					</div>
					{#if allows.length === 0}
						<div class="page__notice">No domain allows.</div>
					{:else}
						<ul class="admin-list">
							{#each allows as allow (allow.id)}
								<li class="admin-list__row">
									<span>{allow.domain}</span>
									<button
										type="button"
										class="gr-button gr-button--outline"
										onclick={() => handleDeleteAllow(allow.id)}
										disabled={isBusy}
									>
										Delete
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<div class="admin-panel">
					<h3>Email domain blocks</h3>
					<div class="admin-inline-form">
						<input type="text" bind:value={emailBlockDomain} placeholder="example.com" />
						<button
							type="button"
							class="gr-button gr-button--solid"
							onclick={handleAddEmailBlock}
							disabled={isBusy}
						>
							Add
						</button>
					</div>
					{#if emailBlocks.length === 0}
						<div class="page__notice">No email domain blocks.</div>
					{:else}
						<ul class="admin-list">
							{#each emailBlocks as block (block.id)}
								<li class="admin-list__row">
									<span>{block.domain}</span>
									<button
										type="button"
										class="gr-button gr-button--outline"
										onclick={() => handleDeleteEmailBlock(block.id)}
										disabled={isBusy}
									>
										Delete
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>

			<div class="admin-panel">
				<h3>Domain blocks</h3>

				<div class="admin-form-grid">
					<label class="admin-surface__control">
						<span>Domain</span>
						<input type="text" bind:value={blockDomain} placeholder="example.com" disabled={Boolean(editingBlockId)} />
					</label>
					<label class="admin-surface__control">
						<span>Severity</span>
						<select bind:value={blockSeverity}>
							<option value="silence">silence</option>
							<option value="suspend">suspend</option>
						</select>
					</label>
					<label class="admin-filter-panel__check">
						<input type="checkbox" bind:checked={blockRejectMedia} />
						Reject media
					</label>
					<label class="admin-filter-panel__check">
						<input type="checkbox" bind:checked={blockRejectReports} />
						Reject reports
					</label>
					<label class="admin-filter-panel__check">
						<input type="checkbox" bind:checked={blockObfuscate} />
						Obfuscate
					</label>
					<label class="admin-surface__control admin-surface__control--grow">
						<span>Private comment</span>
						<input type="text" bind:value={blockPrivateComment} />
					</label>
					<label class="admin-surface__control admin-surface__control--grow">
						<span>Public comment</span>
						<input type="text" bind:value={blockPublicComment} />
					</label>

					<div class="admin-row-actions">
						<button type="button" class="gr-button gr-button--solid" onclick={handleSaveBlock} disabled={isBusy}>
							{editingBlockId ? 'Update block' : 'Create block'}
						</button>
						{#if editingBlockId}
							<button type="button" class="gr-button gr-button--outline" onclick={resetBlockForm} disabled={isBusy}>
								Cancel
							</button>
						{/if}
					</div>
				</div>

				{#if blocks.length === 0}
					<div class="page__notice">No domain blocks.</div>
				{:else}
					<div class="admin-table">
						<div class="admin-table__scroller">
							<table class="admin-table__table">
								<thead>
									<tr>
										<th scope="col">Domain</th>
										<th scope="col">Severity</th>
										<th scope="col">Reject media</th>
										<th scope="col">Reject reports</th>
										<th scope="col">Obfuscate</th>
										<th scope="col">Updated</th>
										<th scope="col">Actions</th>
									</tr>
								</thead>
								<tbody>
									{#each blocks as block (block.id)}
										<tr>
											<td>{block.domain}</td>
											<td>{block.severity}</td>
											<td>{block.rejectMedia ? 'yes' : 'no'}</td>
											<td>{block.rejectReports ? 'yes' : 'no'}</td>
											<td>{block.obfuscate ? 'yes' : 'no'}</td>
											<td>{new Date(block.updatedAt).toLocaleDateString()}</td>
											<td>
												<div class="admin-row-actions">
													<button
														type="button"
														class="gr-button gr-button--outline"
														onclick={() => startEditBlock(block)}
														disabled={isBusy}
													>
														Edit
													</button>
													<button
														type="button"
														class="gr-button gr-button--outline"
														onclick={() => handleDeleteBlock(block.id)}
														disabled={isBusy}
													>
														Delete
													</button>
												</div>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{/if}

	{#if section === 'announcements'}
		{#if isLoadingAnnouncements}
			<div class="page__notice">Loading announcements…</div>
		{:else}
			<div class="admin-panel">
				<h3>Create announcement</h3>

				<div class="admin-form-grid">
					<label class="admin-surface__control admin-surface__control--grow">
						<span>Text</span>
						<textarea rows="3" bind:value={announcementText} placeholder="Announcement text…"></textarea>
					</label>
					<label class="admin-filter-panel__check">
						<input type="checkbox" bind:checked={announcementAllDay} />
						All day
					</label>
					<label class="admin-surface__control">
						<span>Starts</span>
						<input type="datetime-local" bind:value={announcementStartsAt} />
					</label>
					<label class="admin-surface__control">
						<span>Ends</span>
						<input type="datetime-local" bind:value={announcementEndsAt} />
					</label>

					<div class="admin-row-actions">
						<button
							type="button"
							class="gr-button gr-button--solid"
							onclick={handleCreateAnnouncement}
							disabled={isBusy || !announcementText.trim()}
						>
							Create
						</button>
						<button type="button" class="gr-button gr-button--outline" onclick={() => refreshAnnouncements()} disabled={isBusy}>
							Refresh
						</button>
					</div>
				</div>
			</div>

			<div class="page__notice">
				Announcement update/delete is not currently exposed in GraphQL; this page supports list + create + reactions.
			</div>

			{#if announcements.length === 0}
				<div class="page__notice">No announcements.</div>
			{:else}
				<div class="admin-status-grid">
					{#each announcements as announcement (announcement.id)}
						<article class="admin-detail-card">
							<header class="admin-detail-card__header">
								<h3 class="admin-detail-card__title">Announcement</h3>
								<div class="admin-detail-card__actions">
									<button type="button" class="gr-button gr-button--outline" onclick={() => refreshAnnouncements()} disabled={isBusy}>
										Refresh
									</button>
								</div>
							</header>

							<dl class="admin-detail-grid">
								<dt>ID</dt>
								<dd>{announcement.id}</dd>
								<dt>Published</dt>
								<dd>{new Date(announcement.publishedAt).toLocaleString()}</dd>
								<dt>All day</dt>
								<dd>{announcement.allDay ? 'yes' : 'no'}</dd>
								{#if announcement.startsAt}
									<dt>Starts</dt>
									<dd>{new Date(announcement.startsAt).toLocaleString()}</dd>
								{/if}
								{#if announcement.endsAt}
									<dt>Ends</dt>
									<dd>{new Date(announcement.endsAt).toLocaleString()}</dd>
								{/if}
							</dl>

							<p>{announcement.text}</p>

							<div class="admin-detail-section">
								<h4>Reactions</h4>
								{#if announcement.reactions.length === 0}
									<p>No reactions yet.</p>
								{:else}
									<ul class="admin-reaction-list">
										{#each announcement.reactions as reaction (reaction.name)}
											<li class="admin-reaction-list__item">
												<button
													type="button"
													class="gr-button gr-button--outline"
													onclick={() =>
														toggleAnnouncementReaction(announcement.id, reaction.name, reaction.me)
													}
													disabled={isBusy}
												>
													{reaction.me ? 'Remove' : 'Add'} {reaction.name} ({reaction.count})
												</button>
											</li>
										{/each}
									</ul>
								{/if}

								<div class="admin-inline-form">
									<input
										type="text"
										bind:value={reactionDrafts[announcement.id]}
										placeholder="Reaction name (e.g. 👍)"
									/>
									<button
										type="button"
										class="gr-button gr-button--solid"
										onclick={() =>
											toggleAnnouncementReaction(announcement.id, reactionDrafts[announcement.id] ?? '', false)
										}
										disabled={isBusy || !reactionDrafts[announcement.id]?.trim()}
									>
										Add
									</button>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		{/if}
	{/if}

	{#if section === 'emojis'}
		{#if isLoadingEmojis}
			<div class="page__notice">Loading custom emojis…</div>
		{:else}
			<div class="admin-panel">
				<h3>Create custom emoji</h3>

				<div class="admin-form-grid">
					<label class="admin-surface__control">
						<span>Shortcode</span>
						<input type="text" bind:value={emojiShortcode} placeholder="partyparrot" />
					</label>
					<label class="admin-surface__control admin-surface__control--grow">
						<span>Image URL (optional)</span>
						<input type="text" bind:value={emojiImageUrl} placeholder="https://…" />
					</label>
					<label class="admin-surface__control">
						<span>Upload file (optional)</span>
						<input
							type="file"
							accept="image/*"
							onchange={(event) => {
								const input = event.currentTarget as HTMLInputElement;
								emojiImageFile = input.files?.[0] ?? null;
							}}
						/>
					</label>
					<label class="admin-surface__control">
						<span>Category</span>
						<input type="text" bind:value={emojiCategory} placeholder="custom" />
					</label>
					<label class="admin-filter-panel__check">
						<input type="checkbox" bind:checked={emojiVisibleInPicker} />
						Visible in picker
					</label>

					<div class="admin-row-actions">
						<button
							type="button"
							class="gr-button gr-button--solid"
							onclick={handleCreateEmoji}
							disabled={isBusy || !emojiShortcode.trim()}
						>
							Create
						</button>
						<button type="button" class="gr-button gr-button--outline" onclick={() => refreshEmojis()} disabled={isBusy}>
							Refresh
						</button>
					</div>
				</div>
			</div>

			{#if emojis.length === 0}
				<div class="page__notice">No custom emojis.</div>
			{:else}
				<div class="admin-table">
					<div class="admin-table__scroller">
						<table class="admin-table__table">
							<thead>
								<tr>
									<th scope="col">Emoji</th>
									<th scope="col">Shortcode</th>
									<th scope="col">Category</th>
									<th scope="col">Visible</th>
									<th scope="col">Actions</th>
								</tr>
							</thead>
							<tbody>
								{#each emojis as emoji (emoji.id)}
									<tr>
										<td>
											<img src={emoji.url} alt={`:${emoji.shortcode}:`} class="admin-emoji__img" />
										</td>
										<td>:{emoji.shortcode}:</td>
										<td>
											<input
												type="text"
												value={emojiEdits[emoji.shortcode]?.category ?? ''}
												oninput={(event) => {
													const value = (event.currentTarget as HTMLInputElement).value;
													emojiEdits = {
														...emojiEdits,
														[emoji.shortcode]: {
															category: value,
															visibleInPicker: emojiEdits[emoji.shortcode]?.visibleInPicker ?? emoji.visibleInPicker,
														},
													};
												}}
											/>
										</td>
										<td>
											<input
												type="checkbox"
												checked={emojiEdits[emoji.shortcode]?.visibleInPicker ?? emoji.visibleInPicker}
												onchange={(event) => {
													const checked = (event.currentTarget as HTMLInputElement).checked;
													emojiEdits = {
														...emojiEdits,
														[emoji.shortcode]: {
															category: emojiEdits[emoji.shortcode]?.category ?? emoji.category ?? '',
															visibleInPicker: checked,
														},
													};
												}}
											/>
										</td>
										<td>
											<div class="admin-row-actions">
												<button
													type="button"
													class="gr-button gr-button--outline"
													onclick={() => handleUpdateEmoji(emoji.shortcode)}
													disabled={isBusy}
												>
													Save
												</button>
												<button
													type="button"
													class="gr-button gr-button--outline"
													onclick={() => handleDeleteEmoji(emoji.shortcode)}
													disabled={isBusy}
												>
													Delete
												</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</div>
