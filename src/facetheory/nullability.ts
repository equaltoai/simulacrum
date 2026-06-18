export function arrayOrEmpty<T>(value: readonly T[] | null | undefined): readonly T[] {
	return Array.isArray(value) ? value : [];
}
