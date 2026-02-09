import type { TimelineItem } from '$lib/greater/adapters';
import type {
	AttachmentFieldsFragment,
	CommunityNoteFieldsFragment,
	MentionFieldsFragment,
	ObjectFieldsFragment,
	QuoteContextFieldsFragment,
	QuotePermission,
	Visibility,
} from '$lib/greater/adapters/graphql';
import type {
	Account,
	CommunityNote,
	MediaAttachment,
	Mention,
	Notification,
	Status,
	Tag,
} from '$lib/types';

type ActorLike = {
	readonly id: string;
	readonly username: string;
	readonly domain?: string | null;
	readonly displayName?: string | null;
	readonly summary?: string | null;
	readonly avatar?: string | null;
	readonly header?: string | null;
	readonly followers: number;
	readonly following: number;
	readonly statusesCount: number;
	readonly bot: boolean;
	readonly locked: boolean;
	readonly updatedAt: string;
	readonly trustScore: number;
	readonly createdAt?: string | null;
};

function toAccountAcct(username: string, domain?: string | null): string {
	return domain ? `${username}@${domain}` : username;
}

export function toAccount(actor: ActorLike): Account {
	return {
		id: actor.id,
		username: actor.username,
		acct: toAccountAcct(actor.username, actor.domain),
		displayName: actor.displayName ?? actor.username,
		avatar: actor.avatar ?? '',
		header: actor.header ?? '',
		note: actor.summary ?? '',
		url: actor.id,
		followersCount: actor.followers,
		followingCount: actor.following,
		statusesCount: actor.statusesCount,
		bot: actor.bot,
		locked: actor.locked,
		createdAt: actor.createdAt ?? actor.updatedAt,
		trustScore: actor.trustScore,
	};
}

function toVisibility(visibility: Visibility): Status['visibility'] {
	switch (visibility) {
		case 'PUBLIC':
			return 'public';
		case 'UNLISTED':
			return 'unlisted';
		case 'FOLLOWERS':
			return 'private';
		case 'DIRECT':
			return 'direct';
		default:
			return 'public';
	}
}

function toQuoteContext(context: QuoteContextFieldsFragment | null | undefined): Status['quoteContext'] {
	if (!context) return undefined;

	return {
		originalAuthor: toAccount(context.originalAuthor),
		quoteAllowed: context.quoteAllowed,
		quoteType: context.quoteType,
		withdrawn: context.withdrawn,
	};
}

function toMention(mention: MentionFieldsFragment): Mention {
	return {
		id: mention.id,
		username: mention.username,
		acct: toAccountAcct(mention.username, mention.domain),
		url: mention.url,
	};
}

function toTag(tag: { readonly name: string; readonly url: string }): Tag {
	return {
		name: tag.name,
		url: tag.url,
	};
}

function toCommunityNote(note: CommunityNoteFieldsFragment): CommunityNote {
	return {
		id: note.id,
		author: toAccount(note.author),
		content: note.content,
		helpful: note.helpful,
		notHelpful: note.notHelpful,
		createdAt: note.createdAt,
	};
}

function toMediaAttachmentType(type: string): MediaAttachment['type'] {
	const normalized = type.toUpperCase();
	if (normalized === 'VIDEO') return 'video';
	if (normalized === 'AUDIO') return 'audio';
	if (normalized === 'GIF' || normalized === 'GIFV') return 'gifv';
	return 'image';
}

function toMediaCategory(type: string): MediaAttachment['mediaCategory'] {
	const normalized = type.toUpperCase();
	if (normalized === 'VIDEO') return 'VIDEO';
	if (normalized === 'AUDIO') return 'AUDIO';
	if (normalized === 'GIF' || normalized === 'GIFV') return 'GIFV';
	if (normalized === 'DOCUMENT') return 'DOCUMENT';
	return 'IMAGE';
}

function toMediaAttachment(attachment: AttachmentFieldsFragment): MediaAttachment {
	return {
		id: attachment.id,
		type: toMediaAttachmentType(attachment.type),
		url: attachment.url,
		previewUrl: attachment.preview ?? undefined,
		description: attachment.description ?? undefined,
		blurhash: attachment.blurhash ?? undefined,
		mediaCategory: toMediaCategory(attachment.type),
		meta: {
			width: attachment.width ?? undefined,
			height: attachment.height ?? undefined,
			duration: attachment.duration ?? undefined,
		},
	};
}

type ObjectLike = ObjectFieldsFragment | Omit<ObjectFieldsFragment, 'boostedObject'>;

export function toStatus(object: ObjectLike, depth = 0): Status {
	const boostedObject = 'boostedObject' in object ? object.boostedObject : undefined;

	const reblog =
		boostedObject && depth < 1
			? toStatus(boostedObject, depth + 1)
			: undefined;

	const editedAt = object.updatedAt !== object.createdAt ? object.updatedAt : undefined;

	return {
		id: object.id,
		uri: object.id,
		url: object.id,
		account: toAccount(object.actor),
		content: object.content,
		createdAt: object.createdAt,
		editedAt,
		sensitive: object.sensitive,
		spoilerText: object.spoilerText ?? undefined,
		visibility: toVisibility(object.visibility),
		repliesCount: object.repliesCount,
		reblogsCount: object.sharesCount,
		favouritesCount: object.likesCount,
		reblog,
		mediaAttachments: object.attachments.map(toMediaAttachment),
		mentions: object.mentions.map(toMention),
		tags: object.tags.map(toTag),
		inReplyToId: object.inReplyTo?.id ?? undefined,
		inReplyToAccountId: object.inReplyTo?.actor?.id ?? undefined,
		inReplyToAccount: object.inReplyTo?.actor ? toAccount(object.inReplyTo.actor) : undefined,

		// Lesser enhancements
		estimatedCost: object.estimatedCost,
		moderationScore: object.moderationScore ?? undefined,
		communityNotes: object.communityNotes.map(toCommunityNote),
		quoteUrl: object.quoteUrl ?? undefined,
		quoteable: object.quoteable,
		quotePermissions: object.quotePermissions as QuotePermission,
		quoteContext: toQuoteContext(object.quoteContext),
		quoteCount: object.quoteCount,
	};
}

function parseTimestamp(value: string | Date): number {
	if (typeof value === 'string') {
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? Date.now() : parsed;
	}
	return Number.isFinite(value.getTime()) ? value.getTime() : Date.now();
}

export function statusToTimelineItem(status: Status): TimelineItem {
	const lesserMetadata: NonNullable<TimelineItem['metadata']>['lesser'] = {};

	if (status.estimatedCost !== undefined) lesserMetadata.estimatedCost = status.estimatedCost;
	if (status.moderationScore !== undefined) lesserMetadata.moderationScore = status.moderationScore;
	if (status.isDeleted) lesserMetadata.isDeleted = true;
	if (status.deletedAt) lesserMetadata.deletedAt = String(status.deletedAt);
	if (status.formerType) lesserMetadata.formerType = status.formerType;
	if (status.communityNotes && status.communityNotes.length > 0) {
		lesserMetadata.hasCommunityNotes = true;
		lesserMetadata.communityNotesCount = status.communityNotes.length;
	}
	if (status.quoteUrl) lesserMetadata.isQuote = true;
	if (status.quoteCount !== undefined) lesserMetadata.quoteCount = status.quoteCount;
	if (status.quoteable !== undefined) lesserMetadata.quoteable = status.quoteable;
	if (status.quotePermissions) lesserMetadata.quotePermission = status.quotePermissions;
	if (status.account.trustScore !== undefined) lesserMetadata.authorTrustScore = status.account.trustScore;
	if (status.aiAnalysis) {
		lesserMetadata.aiModerationAction = status.aiAnalysis.moderationAction;
		lesserMetadata.aiConfidence = status.aiAnalysis.confidence;
	}

	const metadata: TimelineItem['metadata'] =
		Object.keys(lesserMetadata).length > 0 ? { lesser: lesserMetadata } : undefined;

	return {
		id: status.id,
		type: status.isDeleted ? 'tombstone' : 'status',
		timestamp: parseTimestamp(status.createdAt),
		content: status,
		metadata,
	};
}

function toNotificationType(type: string): Notification['type'] {
	switch (type) {
		case 'MENTION':
			return 'mention';
		case 'FOLLOW':
			return 'follow';
		case 'FOLLOW_REQUEST':
			return 'follow_request';
		case 'SHARE':
			return 'reblog';
		case 'FAVORITE':
			return 'favourite';
		case 'POST':
			return 'status';
		case 'POLL_ENDED':
			return 'poll';
		case 'STATUS_UPDATE':
			return 'update';
		case 'ADMIN_SIGNUP':
			return 'admin.sign_up';
		case 'ADMIN_REPORT':
			return 'admin.report';
		case 'QUOTE':
			return 'quote';
		case 'COMMUNITY_NOTE':
			return 'community_note';
		case 'TRUST_UPDATE':
			return 'trust_update';
		case 'COST_ALERT':
			return 'cost_alert';
		case 'MODERATION_ACTION':
			return 'moderation_action';
		default:
			return 'mention';
	}
}

export function toNotification(input: {
	readonly id: string;
	readonly type: string;
	readonly read?: boolean | null;
	readonly createdAt: string;
	readonly account: ActorLike;
	readonly status?: ObjectFieldsFragment | null;
}): Notification {
	const type = toNotificationType(input.type);
	const base = {
		id: input.id,
		type,
		createdAt: input.createdAt,
		account: toAccount(input.account),
		read: input.read ?? undefined,
	} as const;

	const mappedStatus = input.status ? toStatus(input.status) : undefined;

	switch (type) {
		case 'follow':
		case 'follow_request':
		case 'admin.sign_up':
		case 'trust_update':
		case 'cost_alert':
		case 'moderation_action':
			return base as unknown as Notification;
		default:
			if (!mappedStatus) {
				return base as unknown as Notification;
			}

			return { ...(base as unknown as Record<string, unknown>), status: mappedStatus } as Notification;
	}
}
