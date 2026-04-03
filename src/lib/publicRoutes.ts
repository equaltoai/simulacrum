export const PUBLIC_APP_BASE_PATH = '/l';

function trimRouteValue(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export function normalizeProfileIdentifier(value: string | null | undefined): string | null {
	const trimmed = trimRouteValue(value);
	if (!trimmed) return null;

	try {
		const decoded = decodeURIComponent(trimmed).trim().replace(/^@+/, '');
		return decoded || null;
	} catch {
		const normalized = trimmed.replace(/^@+/, '');
		return normalized || null;
	}
}

function extractActorSlug(actorId: string | null | undefined): string | null {
	const trimmed = trimRouteValue(actorId);
	if (!trimmed) return null;

	try {
		const parsed = new URL(trimmed);
		const segments = parsed.pathname.split('/').filter(Boolean);
		return normalizeProfileIdentifier(segments.at(-1) ?? null);
	} catch {
		return null;
	}
}

function extractActorHost(actorId: string | null | undefined): string | null {
	const trimmed = trimRouteValue(actorId);
	if (!trimmed) return null;

	try {
		return new URL(trimmed).host || null;
	} catch {
		return null;
	}
}

function currentWindowHost(): string | null {
	if (typeof window === 'undefined') return null;
	return window.location.host || null;
}

function buildPublicUrl(pathname: string): URL {
	return new URL(pathname, 'https://simulacrum.invalid');
}

export function buildPublicStatusHref(statusId: string | null | undefined): string {
	const trimmed = trimRouteValue(statusId);
	const pathname = trimmed
		? `${PUBLIC_APP_BASE_PATH}/status/${encodeURIComponent(trimmed)}`
		: `${PUBLIC_APP_BASE_PATH}/status`;
	return buildPublicUrl(pathname).pathname;
}

export function buildPublicProfileHref({
	actorId,
	acct,
	username,
}: {
	actorId?: string | null;
	acct?: string | null;
	username?: string | null;
}): string {
	const normalizedUsername = normalizeProfileIdentifier(username);
	const normalizedAcct = normalizeProfileIdentifier(acct);
	const actorHost = extractActorHost(actorId);
	const currentHost = currentWindowHost();

	let identifier =
		normalizedUsername ??
		normalizedAcct ??
		extractActorSlug(actorId) ??
		'profile';

	if (normalizedAcct && normalizedAcct.includes('@')) {
		identifier = normalizedAcct;
	}

	if (normalizedUsername && actorHost && currentHost && actorHost === currentHost) {
		identifier = normalizedUsername;
	}

	const url = buildPublicUrl(
		`${PUBLIC_APP_BASE_PATH}/profile/${encodeURIComponent(identifier)}`
	);
	const trimmedActorId = trimRouteValue(actorId);
	if (trimmedActorId) {
		url.searchParams.set('id', trimmedActorId);
	}

	return `${url.pathname}${url.search}`;
}
