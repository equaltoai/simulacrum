import type { TimelineItem } from '$lib/greater/adapters';
import type {
	AttachmentFieldsFragment,
	CommunityNoteFieldsFragment,
	MentionFieldsFragment,
	ObjectFieldsFragment,
	Poll as GraphQLPoll,
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
	Poll,
	Reputation,
	Status,
	Tag,
	Vouch,
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
	readonly fields?: ReadonlyArray<{
		readonly name: string;
		readonly value: string;
		readonly verifiedAt?: string | null;
	}>;
	readonly isAgent?: boolean;
	readonly agentInfo?: {
		readonly id: string;
		readonly agentType: string;
		readonly verified: boolean;
		readonly verifiedAt?: string | null;
	} | null;
	readonly tipAddress?: string | null;
	readonly tipChainId?: number | null;
	readonly trustScore: number;
	readonly createdAt?: string | null;
	readonly reputation?: ReputationLike | null;
	readonly vouches?: ReadonlyArray<VouchLike>;
};

type ReputationLike = {
	readonly actorId: string;
	readonly instance: string;
	readonly totalScore: number;
	readonly trustScore: number;
	readonly activityScore: number;
	readonly moderationScore: number;
	readonly communityScore: number;
	readonly calculatedAt: string;
	readonly version: string;
	readonly signature?: string | null;
	readonly evidence: {
		readonly totalPosts: number;
		readonly totalFollowers: number;
		readonly accountAge: number;
		readonly vouchCount: number;
		readonly trustingActors: number;
		readonly averageTrustScore: number;
	};
};

type VouchLike = {
	readonly id: string;
	readonly from: ActorLike;
	readonly to: ActorLike;
	readonly confidence: number;
	readonly context: string;
	readonly voucherReputation: number;
	readonly createdAt: string;
	readonly expiresAt: string;
	readonly active: boolean;
	readonly revoked: boolean;
	readonly revokedAt?: string | null;
};

function toAccountAcct(username: string, domain?: string | null): string {
	return domain ? `${username}@${domain}` : username;
}

function toReputation(reputation: ReputationLike): Reputation {
	return {
		actorId: reputation.actorId,
		instance: reputation.instance,
		totalScore: reputation.totalScore,
		trustScore: reputation.trustScore,
		activityScore: reputation.activityScore,
		moderationScore: reputation.moderationScore,
		communityScore: reputation.communityScore,
		calculatedAt: reputation.calculatedAt,
		version: reputation.version,
		evidence: {
			totalPosts: reputation.evidence.totalPosts,
			totalFollowers: reputation.evidence.totalFollowers,
			accountAge: reputation.evidence.accountAge,
			vouchCount: reputation.evidence.vouchCount,
			trustingActors: reputation.evidence.trustingActors,
			averageTrustScore: reputation.evidence.averageTrustScore,
		},
		signature: reputation.signature ?? undefined,
	};
}

function toVouch(vouch: VouchLike): Vouch {
	return {
		id: vouch.id,
		from: toAccount(vouch.from),
		to: toAccount(vouch.to),
		confidence: vouch.confidence,
		context: vouch.context,
		voucherReputation: vouch.voucherReputation,
		createdAt: vouch.createdAt,
		expiresAt: vouch.expiresAt,
		active: vouch.active,
		revoked: vouch.revoked,
		revokedAt: vouch.revokedAt ?? undefined,
	};
}

export function toAccount(actor: ActorLike): Account {
	const reputation = actor.reputation ? toReputation(actor.reputation) : undefined;
	const vouches = actor.vouches ? actor.vouches.map(toVouch) : undefined;
	const fields = actor.fields ? actor.fields.map((field) => ({ ...field })) : undefined;

	const agentInfo = actor.agentInfo
		? {
				id: actor.agentInfo.id,
				agentType: actor.agentInfo.agentType,
				verified: actor.agentInfo.verified,
				verifiedAt: actor.agentInfo.verifiedAt ?? undefined,
			}
		: undefined;

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
		fields,
		isAgent: actor.isAgent ?? false,
		agentInfo,
		tipAddress: actor.tipAddress ?? undefined,
		tipChainId: actor.tipChainId ?? undefined,
		trustScore: actor.trustScore,
		reputation,
		vouches,
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

function toPoll(poll: GraphQLPoll): Poll {
	return {
		id: poll.id,
		expiresAt: poll.expiresAt ?? undefined,
		expired: poll.expired,
		multiple: poll.multiple,
		hideTotals: poll.hideTotals,
		votesCount: poll.votesCount,
		votersCount: poll.votersCount,
		voted: poll.voted,
		ownVotes: poll.ownVotes ? [...poll.ownVotes] : undefined,
		options: poll.options.map((option) => ({
			title: option.title,
			votesCount: option.votesCount,
		})),
	};
}

type ObjectLike = (ObjectFieldsFragment | Omit<ObjectFieldsFragment, 'boostedObject'>) & {
	poll?: GraphQLPoll | null;
};

export function toStatus(object: ObjectLike, depth = 0): Status {
	const boostedObject = 'boostedObject' in object ? object.boostedObject : undefined;

	const reblog =
		boostedObject && depth < 1
			? toStatus(boostedObject, depth + 1)
			: undefined;

	const editedAt = object.updatedAt !== object.createdAt ? object.updatedAt : undefined;
	const reblogged = 'boosted' in object && typeof object.boosted === 'boolean' ? object.boosted : undefined;
	const viewerFavourited =
		'viewerFavourited' in object && typeof object.viewerFavourited === 'boolean'
			? object.viewerFavourited
			: undefined;
	const viewerBookmarked =
		'viewerBookmarked' in object && typeof object.viewerBookmarked === 'boolean'
			? object.viewerBookmarked
			: undefined;
	const viewerPinned =
		'viewerPinned' in object && typeof object.viewerPinned === 'boolean' ? object.viewerPinned : undefined;
	const poll = object.poll ? toPoll(object.poll) : undefined;
	const attribution =
		'agentAttribution' in object && object.agentAttribution
			? {
					triggerType: object.agentAttribution.triggerType ?? undefined,
					triggerDetails: object.agentAttribution.triggerDetails ?? undefined,
					memoryCitations: object.agentAttribution.memoryCitations ?? undefined,
					delegatedBy: object.agentAttribution.delegatedBy ?? undefined,
					scopes: object.agentAttribution.scopes ?? undefined,
					constraints: object.agentAttribution.constraints ?? undefined,
					modelVersion: object.agentAttribution.modelVersion ?? undefined,
				}
			: undefined;

	return {
		id: object.id,
		uri: object.id,
		url: object.id,
		contentHash: object.contentHash,
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
		reblogged,
		favourited: viewerFavourited,
		bookmarked: viewerBookmarked,
		pinned: viewerPinned,
		reblog,
		mediaAttachments: object.attachments.map(toMediaAttachment),
		poll,
		mentions: object.mentions.map(toMention),
		tags: object.tags.map(toTag),
		inReplyToId: object.inReplyTo?.id ?? undefined,
		inReplyToAccountId: object.inReplyTo?.actor?.id ?? undefined,
		inReplyToAccount: object.inReplyTo?.actor ? toAccount(object.inReplyTo.actor) : undefined,

		// Lesser enhancements
		estimatedCost: object.estimatedCost,
		moderationScore: object.moderationScore ?? undefined,
		communityNotes: object.communityNotes.map(toCommunityNote),
		agentAttribution: attribution,
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
	const key = type.trim().toUpperCase();

	switch (key) {
		case 'MENTION':
		case 'MENTIONED':
		case 'MENTION_NOTIFICATION':
			return 'mention';
		case 'FOLLOW':
		case 'FOLLOWED':
			return 'follow';
		case 'FOLLOW_REQUEST':
		case 'FOLLOWREQUEST':
		case 'FOLLOW_REQUESTED':
			return 'follow_request';
		case 'REBLOG':
		case 'SHARE':
		case 'BOOST':
			return 'reblog';
		case 'FAVOURITE':
		case 'FAVORITE':
		case 'LIKE':
			return 'favourite';
		case 'STATUS':
		case 'POST':
			return 'status';
		case 'POLL':
		case 'POLL_ENDED':
			return 'poll';
		case 'UPDATE':
		case 'STATUS_UPDATE':
			return 'update';
		case 'ADMIN_SIGNUP':
		case 'ADMIN_SIGN_UP':
		case 'ADMIN.SIGN_UP':
			return 'admin.sign_up';
		case 'ADMIN_REPORT':
		case 'ADMIN.REPORT':
			return 'admin.report';
		case 'QUOTE':
			return 'quote';
		case 'COMMUNITY_NOTE':
		case 'COMMUNITYNOTE':
			return 'community_note';
		case 'TRUST_UPDATE':
		case 'TRUSTUPDATE':
			return 'trust_update';
		case 'COST_ALERT':
		case 'COSTALERT':
			return 'cost_alert';
		case 'MODERATION_ACTION':
		case 'MODERATIONACTION':
			return 'moderation_action';
		default:
			// Mastodon-style notification types come back lowercased (follow/mention/reblog/favourite).
			// Fall back to matching those by normalizing to upper-case above.
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
