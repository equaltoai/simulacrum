export type SoulEmailAddressKind =
	| 'instance-scoped-managed'
	| 'legacy-inbound-alias'
	| 'external-or-unknown';

export type SoulEmailBadgeColor = 'primary' | 'warning' | 'gray';

export interface SoulEmailAddressMeta {
	kind: SoulEmailAddressKind;
	badgeLabel: string | null;
	badgeColor: SoulEmailBadgeColor;
	description: string | null;
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

export function describeSoulEmailAddress(address: string | null | undefined): SoulEmailAddressMeta {
	const localPart = getLesserSoulLocalPart(address ?? '');
	if (!localPart) {
		return {
			kind: 'external-or-unknown',
			badgeLabel: null,
			badgeColor: 'gray',
			description: null,
		};
	}

	// Host v0.4.3 makes `<agent-local-id>.<instance-slug>@lessersoul.ai` the
	// current public channel. This presentation check deliberately does not split
	// the dotted local-part or recover agent / instance identity from it.
	if (localPart.includes('.')) {
		return {
			kind: 'instance-scoped-managed',
			badgeLabel: 'Instance-scoped',
			badgeColor: 'primary',
			description: 'Current public Lesser Soul email channel.',
		};
	}

	return {
		kind: 'legacy-inbound-alias',
		badgeLabel: 'Legacy inbound alias',
		badgeColor: 'warning',
		description:
			'Inbound-only alias; current public channel uses agent.instance@lessersoul.ai.',
	};
}
