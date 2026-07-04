// Detects the high-level shape of a parsed YAML value so the view can pick a
// sensible default renderer (table for record lists, form for maps, etc.).

export type YamlShape = "records" | "list" | "map" | "scalar";

/** A plain JSON-like object (not an array, not null). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value)
	);
}

/**
 * Classify a parsed YAML value:
 * - `records`: an array whose items are (mostly) plain objects — a table.
 * - `list`: any other array (scalars, mixed, nested arrays).
 * - `map`: a plain object.
 * - `scalar`: anything else (string, number, boolean, null, undefined).
 */
export function detectShape(value: unknown): YamlShape {
	if (Array.isArray(value)) {
		if (value.length > 0 && value.every(isPlainObject)) {
			return "records";
		}
		return "list";
	}
	if (isPlainObject(value)) {
		return "map";
	}
	return "scalar";
}

/**
 * Ordered union of keys across all records, preserving first-seen order.
 * This is the free-form "column set" for the table renderer.
 */
export function collectColumns(records: Record<string, unknown>[]): string[] {
	const columns: string[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		for (const key of Object.keys(record)) {
			if (!seen.has(key)) {
				seen.add(key);
				columns.push(key);
			}
		}
	}
	return columns;
}
