export function splitScopes(scope?: string): string[] {
	return (scope ?? '').split(/\s+/g).filter(Boolean);
}

export function hasAdminScope(scope?: string): boolean {
	const scopes = splitScopes(scope);
	return scopes.includes('admin') || scopes.includes('admin:read') || scopes.includes('admin:write');
}

