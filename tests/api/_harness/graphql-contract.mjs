import { readFile } from 'node:fs/promises';

import { buildSchema, parse, validate } from 'graphql';

function formatError(error) {
	return {
		message: error?.message ?? String(error),
		locations: Array.isArray(error?.locations) ? error.locations : null,
	};
}

export async function createGraphQLContractValidator({ schemaPath }) {
	const sdl = await readFile(schemaPath, 'utf8');
	const schema = buildSchema(sdl);

	return {
		validateDocument({ query }) {
			if (typeof query !== 'string' || !query.trim()) {
				return { valid: false, errors: [{ message: 'Missing GraphQL query string', locations: null }] };
			}

			let document;
			try {
				document = parse(query);
			} catch (error) {
				return { valid: false, errors: [formatError(error)] };
			}

			const errors = validate(schema, document);
			if (!errors.length) return { valid: true, errors: [] };
			return { valid: false, errors: errors.map(formatError) };
		},
	};
}

