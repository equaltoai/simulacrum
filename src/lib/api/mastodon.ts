import type { Account, MediaAttachment, Mention, Status, Tag } from '$lib/types';

type MastodonAccount = {
	readonly id: string;
	readonly username: string;
	readonly acct: string;
	readonly display_name?: string;
	readonly avatar?: string;
	readonly header?: string;
	readonly note?: string;
	readonly url?: string;
	readonly followers_count?: number;
	readonly following_count?: number;
	readonly statuses_count?: number;
	readonly bot?: boolean;
	readonly locked?: boolean;
	readonly created_at?: string;
};

type MastodonMediaAttachment = {
	readonly id: string;
	readonly type: string;
	readonly url?: string | null;
	readonly preview_url?: string | null;
	readonly description?: string | null;
	readonly blurhash?: string | null;
	readonly meta?: {
		readonly original?: { readonly width?: number; readonly height?: number };
		readonly small?: { readonly width?: number; readonly height?: number };
		readonly duration?: number;
	};
};

type MastodonMention = {
	readonly id: string;
	readonly username: string;
	readonly acct: string;
	readonly url: string;
};

type MastodonTag = {
	readonly name: string;
	readonly url: string;
};

export type MastodonStatus = {
	readonly id: string;
	readonly uri?: string;
	readonly url?: string;
	readonly account: MastodonAccount;
	readonly content: string;
	readonly created_at: string;
	readonly edited_at?: string | null;
	readonly sensitive?: boolean;
	readonly spoiler_text?: string;
	readonly visibility?: Status['visibility'];
	readonly language?: string | null;
	readonly replies_count?: number;
	readonly reblogs_count?: number;
	readonly favourites_count?: number;
	readonly reblogged?: boolean;
	readonly favourited?: boolean;
	readonly bookmarked?: boolean;
	readonly muted?: boolean;
	readonly pinned?: boolean;
	readonly reblog?: MastodonStatus | null;
	readonly media_attachments?: MastodonMediaAttachment[];
	readonly mentions?: MastodonMention[];
	readonly tags?: MastodonTag[];
	readonly in_reply_to_id?: string | null;
	readonly in_reply_to_account_id?: string | null;
};

export type MastodonStatusContext = {
	readonly ancestors: MastodonStatus[];
	readonly descendants: MastodonStatus[];
};

function toMediaAttachmentType(type: string): MediaAttachment['type'] {
	const normalized = type.toLowerCase();
	if (normalized === 'video') return 'video';
	if (normalized === 'audio') return 'audio';
	if (normalized === 'gifv' || normalized === 'gif') return 'gifv';
	return 'image';
}

function toMediaAttachmentCategory(type: string): MediaAttachment['mediaCategory'] {
	const normalized = type.toUpperCase();
	if (normalized === 'VIDEO') return 'VIDEO';
	if (normalized === 'AUDIO') return 'AUDIO';
	if (normalized === 'GIF' || normalized === 'GIFV') return 'GIFV';
	if (normalized === 'DOCUMENT') return 'DOCUMENT';
	return 'IMAGE';
}

function toMediaAttachment(input: MastodonMediaAttachment): MediaAttachment {
	const meta = input.meta;
	const width = meta?.original?.width ?? meta?.small?.width;
	const height = meta?.original?.height ?? meta?.small?.height;
	const duration = meta?.duration;

	return {
		id: input.id,
		type: toMediaAttachmentType(input.type),
		url: input.url ?? '',
		previewUrl: input.preview_url ?? undefined,
		description: input.description ?? undefined,
		blurhash: input.blurhash ?? undefined,
		mediaCategory: toMediaAttachmentCategory(input.type),
		meta: {
			width: typeof width === 'number' ? width : undefined,
			height: typeof height === 'number' ? height : undefined,
			duration: typeof duration === 'number' ? duration : undefined,
		},
	};
}

function toMention(input: MastodonMention): Mention {
	return {
		id: input.id,
		username: input.username,
		acct: input.acct,
		url: input.url,
	};
}

function toTag(input: MastodonTag): Tag {
	return { name: input.name, url: input.url };
}

export function toMastodonAccount(account: MastodonAccount): Account {
	return {
		id: account.id,
		username: account.username,
		acct: account.acct,
		displayName: account.display_name || account.username,
		avatar: account.avatar ?? '',
		header: account.header ?? '',
		note: account.note ?? '',
		url: account.url ?? '',
		followersCount: account.followers_count ?? 0,
		followingCount: account.following_count ?? 0,
		statusesCount: account.statuses_count ?? 0,
		bot: account.bot ?? false,
		locked: account.locked ?? false,
		createdAt: account.created_at ?? new Date().toISOString(),
	};
}

export function toMastodonStatus(status: MastodonStatus, depth = 0): Status {
	const reblog = status.reblog && depth < 1 ? toMastodonStatus(status.reblog, depth + 1) : undefined;

	return {
		id: status.id,
		uri: status.uri ?? status.id,
		url: status.url ?? status.uri ?? status.id,
		account: toMastodonAccount(status.account),
		content: status.content,
		createdAt: status.created_at,
		editedAt: status.edited_at ?? undefined,
		sensitive: status.sensitive ?? false,
		spoilerText: status.spoiler_text ?? undefined,
		visibility: status.visibility ?? 'public',
		language: status.language ?? undefined,
		repliesCount: status.replies_count ?? 0,
		reblogsCount: status.reblogs_count ?? 0,
		favouritesCount: status.favourites_count ?? 0,
		reblogged: status.reblogged ?? undefined,
		favourited: status.favourited ?? undefined,
		bookmarked: status.bookmarked ?? undefined,
		muted: status.muted ?? undefined,
		pinned: status.pinned ?? undefined,
		reblog,
		mediaAttachments: status.media_attachments?.map(toMediaAttachment) ?? [],
		mentions: status.mentions?.map(toMention) ?? [],
		tags: status.tags?.map(toTag) ?? [],
		inReplyToId: status.in_reply_to_id ?? undefined,
		inReplyToAccountId: status.in_reply_to_account_id ?? undefined,
	};
}

