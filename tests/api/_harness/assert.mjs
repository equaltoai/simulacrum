export function assert(condition, message) {
	if (!condition) throw new Error(message);
}

export function assertEqual(actual, expected, message) {
	if (actual !== expected) {
		throw new Error(`${message}\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`);
	}
}

export function assertOk(value, message) {
	assert(Boolean(value), message);
}

