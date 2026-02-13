import type { ActivityPubActor } from '$lib/generics';
import type { Account } from '$lib/types';

export function toActivityPubActor(account: Account): ActivityPubActor {
	return {
		id: account.url || account.id,
		type: account.bot ? 'Service' : 'Person',
		name: account.displayName || account.username,
		displayName: account.displayName || account.username,
		preferredUsername: account.acct || account.username,
		username: account.username,
		acct: account.acct,
		bot: account.bot,
		avatar: account.avatar,
		header: account.header,
		summary: account.note,
		url: account.url,
	};
}

