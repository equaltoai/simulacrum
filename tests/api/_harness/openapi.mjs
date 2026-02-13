import { readFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv from 'ajv';
import YAML from 'yaml';

const SCHEMA_ID_PREFIX = 'https://equaltoai.local/openapi/';

function toSchemaId(ref) {
	if (typeof ref !== 'string' || !ref.startsWith('#/')) return ref;
	return `${SCHEMA_ID_PREFIX}${ref.slice(2)}`;
}

function rewriteRefs(value) {
	if (value === null || value === undefined) return value;

	if (typeof value === 'string') return value;

	if (Array.isArray(value)) return value.map((v) => rewriteRefs(v));

	if (typeof value !== 'object') return value;

	const output = {};
	for (const [key, v] of Object.entries(value)) {
		if (key === '$ref' && typeof v === 'string') {
			output[key] = toSchemaId(v);
			continue;
		}
		output[key] = rewriteRefs(v);
	}
	return output;
}

function matchPathTemplate(template, actual) {
	if (template === actual) return true;

	const partsT = template.split('/').filter(Boolean);
	const partsA = actual.split('/').filter(Boolean);
	if (partsT.length !== partsA.length) return false;

	for (let i = 0; i < partsT.length; i++) {
		const t = partsT[i];
		const a = partsA[i];
		if (t.startsWith('{') && t.endsWith('}')) continue;
		if (t !== a) return false;
	}

	return true;
}

function compactAjvErrors(errors, max = 25) {
	if (!Array.isArray(errors)) return null;
	return errors.slice(0, max).map((e) => ({
		instancePath: e.instancePath,
		schemaPath: e.schemaPath,
		keyword: e.keyword,
		message: e.message,
		params: e.params,
	}));
}

export async function createOpenApiValidator({ specPath }) {
	const raw = await readFile(specPath, 'utf8');
	const openapi = YAML.parse(raw);

	const ajv = new Ajv({
		allErrors: true,
		strict: false,
		validateFormats: false,
		logger: false,
	});

	const schemas = openapi?.components?.schemas ?? {};

	for (const [name, schema] of Object.entries(schemas)) {
		const schemaId = `${SCHEMA_ID_PREFIX}components/schemas/${name}`;
		const rewritten = rewriteRefs(schema);
		ajv.addSchema({ $id: schemaId, ...rewritten }, schemaId);
	}

	const validatorCache = new Map();

	function findOperation({ method, pathname }) {
		const paths = openapi?.paths ?? {};

		const direct = paths[pathname];
		if (direct?.[method]) return { pathKey: pathname, operation: direct[method] };

		for (const [key, value] of Object.entries(paths)) {
			if (!value?.[method]) continue;
			if (matchPathTemplate(key, pathname)) return { pathKey: key, operation: value[method] };
		}

		return null;
	}

	function getJsonResponseSchema(operation, status) {
		const response = operation?.responses?.[String(status)];
		const schema = response?.content?.['application/json']?.schema ?? null;
		return schema;
	}

	function getValidator({ operationId, status, schema }) {
		const key = `${operationId ?? 'unknown'}:${status}`;
		if (validatorCache.has(key)) return validatorCache.get(key);

		const rewritten = rewriteRefs(schema);
		const validate = ajv.compile(rewritten);
		validatorCache.set(key, validate);
		return validate;
	}

	return {
		validateRest({ method, pathname, status, contentType, body }) {
			const methodLower = String(method).toLowerCase();
			const opMatch = findOperation({ method: methodLower, pathname });
			if (!opMatch) {
				return { valid: null, skipped: 'no_operation', method: methodLower, pathname };
			}

			const operationId = opMatch.operation?.operationId ?? null;
			const schema = getJsonResponseSchema(opMatch.operation, status);

			if (!schema) {
				return { valid: null, skipped: 'no_schema', operationId, status };
			}

			const ct = String(contentType ?? '').toLowerCase();
			if (ct && !ct.includes('application/json')) {
				return { valid: null, skipped: 'non_json', operationId, status, contentType: ct };
			}

			try {
				const validate = getValidator({ operationId, status, schema });
				const ok = validate(body);
				if (ok) return { valid: true, operationId, status };
				return {
					valid: false,
					operationId,
					status,
					errors: compactAjvErrors(validate.errors),
				};
			} catch (error) {
				return {
					valid: null,
					skipped: 'validator_error',
					operationId,
					status,
					error: error?.message ?? String(error),
				};
			}
		},

		debug: {
			specPath: path.resolve(specPath),
		},
	};
}
