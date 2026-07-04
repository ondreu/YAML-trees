// Turns raw text typed into a cell/field into a typed YAML scalar, and formats
// typed values back into display strings. Kept deliberately conservative so the
// user is never surprised by an unexpected type coercion.

/**
 * Infer a scalar type from user input:
 * - empty string  -> null
 * - "true"/"false" (case-insensitive) -> boolean
 * - "null"/"~"     -> null
 * - a valid number -> number
 * - otherwise      -> the original string
 */
export function coerceScalar(raw: string): string | number | boolean | null {
	const trimmed = raw.trim();
	if (trimmed === "") {
		return null;
	}
	const lower = trimmed.toLowerCase();
	if (lower === "true") return true;
	if (lower === "false") return false;
	if (lower === "null" || trimmed === "~") return null;
	if (isNumeric(trimmed)) {
		return Number(trimmed);
	}
	return raw;
}

/** Human-readable rendering of a scalar for an input field. */
export function formatScalar(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (typeof value === "object") {
		// Nested structures are not editable as a single cell; show a marker.
		return Array.isArray(value) ? `[${value.length} items]` : "{…}";
	}
	return String(value);
}

/** True when the value is a scalar the table/form can edit inline. */
export function isEditableScalar(value: unknown): boolean {
	return value === null || typeof value !== "object";
}

function isNumeric(text: string): boolean {
	// Require a canonical numeric string. Leading-zero integers (e.g. "007"
	// part numbers) are deliberately kept as strings so they aren't mangled.
	if (!/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(text)) {
		return false;
	}
	return Number.isFinite(Number(text));
}
