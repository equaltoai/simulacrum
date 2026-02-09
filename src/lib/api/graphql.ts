import { print } from 'graphql';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

type GraphQLErrorShape = {
	message: string;
	locations?: Array<{ line: number; column: number }>;
	path?: Array<string | number>;
	extensions?: Record<string, unknown>;
};

type GraphQLResponse<T> = {
	data?: T;
	errors?: GraphQLErrorShape[];
};

export class GraphQLRequestError extends Error {
	readonly status: number;
	readonly errors: GraphQLErrorShape[] | null;

	constructor(message: string, { status, errors }: { status: number; errors?: GraphQLErrorShape[] | null }) {
		super(message);
		this.name = 'GraphQLRequestError';
		this.status = status;
		this.errors = errors ?? null;
	}
}

export async function graphqlRequest<
	TData extends Record<string, unknown>,
	TVariables extends Record<string, unknown> | undefined = undefined,
>({
	document,
	variables,
	endpoint = '/api/graphql',
	token,
	signal,
}: {
	document: TypedDocumentNode<TData, TVariables> | string;
	variables?: TVariables;
	endpoint?: string;
	token?: string | null;
	signal?: AbortSignal;
}): Promise<TData> {
	const query = typeof document === 'string' ? document : print(document);

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({
			query,
			...(variables ? { variables } : {}),
		}),
		signal,
	});

	const payload = (await response.json().catch(() => null)) as GraphQLResponse<TData> | null;
	const errors = payload?.errors ?? null;

	if (!response.ok) {
		const errorMessage = errors?.[0]?.message ?? `GraphQL request failed (${response.status})`;
		throw new GraphQLRequestError(errorMessage, { status: response.status, errors });
	}

	if (errors && errors.length > 0) {
		throw new GraphQLRequestError(errors[0]?.message ?? 'GraphQL request failed', {
			status: response.status,
			errors,
		});
	}

	if (!payload?.data) {
		throw new GraphQLRequestError('GraphQL request returned no data', { status: response.status, errors });
	}

	return payload.data;
}

