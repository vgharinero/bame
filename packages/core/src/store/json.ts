/** JSON data with optional object properties; rejects lossy values and cycles. */
export function assertJson(
	value: unknown,
	path = 'value',
	ancestors = new Set<object>(),
): void {
	if (
		value === undefined ||
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean'
	)
		return;
	if (typeof value === 'number' && Number.isFinite(value)) return;
	if (typeof value !== 'object' || ancestors.has(value))
		throw new Error(`${path} must be JSON-compatible`);
	if (
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) !== Object.prototype &&
		Object.getPrototypeOf(value) !== null
	)
		throw new Error(`${path} must contain plain objects`);
	ancestors.add(value);
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			if (!(i in value) || value[i] === undefined)
				throw new Error(`${path}[${i}] cannot be undefined`);
			assertJson(value[i], `${path}[${i}]`, ancestors);
		}
	} else {
		for (const [key, item] of Object.entries(value))
			assertJson(item, `${path}.${key}`, ancestors);
	}
	ancestors.delete(value);
}

export function jsonClone<T>(value: T): T {
	assertJson(value);
	return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

export function canonicalJson(value: unknown): string {
	assertJson(value);
	const normalize = (item: unknown): unknown => {
		if (Array.isArray(item)) return item.map(normalize);
		if (item && typeof item === 'object')
			return Object.fromEntries(
				Object.entries(item)
					.filter(([, v]) => v !== undefined)
					.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
					.map(([k, v]) => [k, normalize(v)]),
			);
		return item;
	};
	return JSON.stringify(normalize(value));
}
