/**
 * Lightweight query-string parser for the hydration data path.
 *
 * Uses `Object.create(null)` to prevent prototype-pollution crashes when
 * query keys shadow Object.prototype names (toString, constructor, __proto__,
 * etc.). This is the canonical defense: the returned accumulator is
 * prototype-free, so `query.toString` is `undefined` rather than inheriting
 * `Object.prototype.toString`.
 *
 * Exported as a standalone module (rather than living inline in entry-server)
 * so that CSR-021 regression tests can import it without pulling in the full
 * entry-server dependency chain.
 */

import type { Query } from '@theory-cloud/facetheory';

export function queryFromSearchString(search: string): Query {
	const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
	const query: Query = Object.create(null);
	for (const [key, value] of params) {
		const values = query[key] ?? [];
		values.push(value);
		query[key] = values;
	}
	return query;
}
