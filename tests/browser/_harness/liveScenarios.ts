export type LivePublicScenario = {
	baseURL: string;
	host: string;
	statusId: string;
	statusPath: string;
	profileActorId: string;
	profileIdentifier: string;
	profilePath: string;
};

type GraphQLResponse<T> = {
	data?: T;
	errors?: Array<{ message?: string }>;
};

type TimelineSeedResponse = {
	timeline?: {
		edges?: Array<{
			node?: {
				id?: string | null;
				actor?: {
					id?: string | null;
					username?: string | null;
					domain?: string | null;
				} | null;
			} | null;
		}>;
	} | null;
};

let cachedScenario: LivePublicScenario | null = null;
let cachedKey: string | null = null;

function trimTrailingSlash(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
}

function requiredBaseURL(): string {
	const value = process.env.BROWSER_TEST_BASE_URL?.trim();
	if (!value) {
		throw new Error('BROWSER_TEST_BASE_URL is required for live browser smoke.');
	}
	return trimTrailingSlash(value);
}

function envOverrideScenario(baseURL: string): LivePublicScenario | null {
	const statusId = process.env.BROWSER_TEST_LIVE_STATUS_ID?.trim();
	const profileIdentifier = process.env.BROWSER_TEST_LIVE_PROFILE_IDENTIFIER?.trim();
	const profileActorId = process.env.BROWSER_TEST_LIVE_PROFILE_ACTOR_ID?.trim();
	if (!statusId || !profileIdentifier) return null;

	const url = new URL(baseURL);
	const profilePath = `/l/profile/${encodeURIComponent(profileIdentifier)}${
		profileActorId ? `?id=${encodeURIComponent(profileActorId)}` : ''
	}`;

	return {
		baseURL,
		host: url.host,
		statusId,
		statusPath: `/l/status/${encodeURIComponent(statusId)}`,
		profileActorId: profileActorId ?? '',
		profileIdentifier,
		profilePath,
	};
}

function profileIdentifierForActor({
	username,
	domain,
	host,
}: {
	username: string;
	domain: string | null;
	host: string;
}): string {
	if (!domain || domain === host) return username;
	return `${username}@${domain}`;
}

async function fetchTimelineSeed(baseURL: string): Promise<LivePublicScenario> {
	const url = new URL(baseURL);
	const response = await fetch(`${baseURL}/api/graphql`, {
		method: 'POST',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			query: `
				query LiveTimelineSeed {
					timeline(type: PUBLIC, first: 5) {
						edges {
							node {
								id
								actor {
									id
									username
									domain
								}
							}
						}
					}
				}
			`,
		}),
	});

	if (!response.ok) {
		throw new Error(`Live scenario discovery failed (${response.status}) for ${baseURL}/api/graphql`);
	}

	const payload = (await response.json()) as GraphQLResponse<TimelineSeedResponse>;
	if (payload.errors?.length) {
		throw new Error(payload.errors[0]?.message ?? `Live scenario discovery returned GraphQL errors for ${baseURL}`);
	}

	const seed = payload.data?.timeline?.edges
		?.map((edge) => edge?.node ?? null)
		.find((node) => node?.id && node.actor?.id && node.actor.username);

	if (!seed?.id || !seed.actor?.id || !seed.actor.username) {
		throw new Error(`No public timeline seed was available for ${baseURL}`);
	}

	const identifier = profileIdentifierForActor({
		username: seed.actor.username,
		domain: seed.actor.domain ?? null,
		host: url.host,
	});

	return {
		baseURL,
		host: url.host,
		statusId: seed.id,
		statusPath: `/l/status/${encodeURIComponent(seed.id)}`,
		profileActorId: seed.actor.id,
		profileIdentifier: identifier,
		profilePath: `/l/profile/${encodeURIComponent(identifier)}?id=${encodeURIComponent(seed.actor.id)}`,
	};
}

export async function resolveLivePublicScenario(): Promise<LivePublicScenario> {
	const baseURL = requiredBaseURL();
	const cacheKey = [
		baseURL,
		process.env.BROWSER_TEST_LIVE_STATUS_ID ?? '',
		process.env.BROWSER_TEST_LIVE_PROFILE_IDENTIFIER ?? '',
		process.env.BROWSER_TEST_LIVE_PROFILE_ACTOR_ID ?? '',
	].join('|');

	if (cachedScenario && cachedKey === cacheKey) {
		return cachedScenario;
	}

	const scenario = envOverrideScenario(baseURL) ?? (await fetchTimelineSeed(baseURL));
	cachedScenario = scenario;
	cachedKey = cacheKey;
	return scenario;
}
