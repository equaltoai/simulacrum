export type SoulEmailAddressKind =
	| 'instance-scoped-managed'
	| 'legacy-inbound-alias'
	| 'lesser-soul-email'
	| 'external-or-unknown';

export type SoulEmailBadgeColor = 'primary' | 'warning' | 'gray';
export type SoulEmailAddressContext =
	| 'current-public-channel'
	| 'legacy-inbound-alias'
	| 'observed-message';

export interface SoulEmailAddressMeta {
	kind: SoulEmailAddressKind;
	badgeLabel: string | null;
	badgeColor: SoulEmailBadgeColor;
	description: string | null;
}

export interface DescribeSoulEmailAddressOptions {
	context?: SoulEmailAddressContext;
}

const LESSER_SOUL_EMAIL_DOMAIN = 'lessersoul.ai';

function getLesserSoulLocalPart(address: string): string | null {
	const trimmed = address.trim();
	const atIndex = trimmed.lastIndexOf('@');
	if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;

	const domain = trimmed.slice(atIndex + 1).toLowerCase();
	if (domain !== LESSER_SOUL_EMAIL_DOMAIN) return null;

	return trimmed.slice(0, atIndex) || null;
}

function legacyAliasMeta(): SoulEmailAddressMeta {
	return {
		kind: 'legacy-inbound-alias',
		badgeLabel: 'Legacy inbound alias',
		badgeColor: 'warning',
		description:
			'Inbound-only alias; current public channel uses agent.instance@lessersoul.ai.',
	};
}

export function describeSoulEmailAddress(
	address: string | null | undefined,
	options: DescribeSoulEmailAddressOptions = {}
): SoulEmailAddressMeta {
	const localPart = getLesserSoulLocalPart(address ?? '');
	if (!localPart) {
		return {
			kind: 'external-or-unknown',
			badgeLabel: null,
			badgeColor: 'gray',
			description: null,
		};
	}

	if (options.context === 'legacy-inbound-alias') {
		return legacyAliasMeta();
	}

	if (!localPart.includes('.')) {
		return legacyAliasMeta();
	}

	// Host v0.4.3 makes `<agent-local-id>.<instance-slug>@lessersoul.ai` the current
	// public channel, but dotted agent local IDs can also exist. Therefore a dot in
	// the email local-part is never enough by itself to infer instance scope.
	if (options.context === 'current-public-channel') {
		return {
			kind: 'instance-scoped-managed',
			badgeLabel: 'Instance-scoped',
			badgeColor: 'primary',
			description: 'Current public Lesser Soul email channel.',
		};
	}

	return {
		kind: 'lesser-soul-email',
		badgeLabel: 'Lesser Soul email',
		badgeColor: 'gray',
		description: 'Managed Lesser Soul email; current-vs-legacy status requires Host channel context.',
	};
}
