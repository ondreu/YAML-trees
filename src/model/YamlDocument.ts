import {
	parse,
	stringify,
	parseDocument,
	parseAllDocuments,
	type ToStringOptions,
} from "yaml";

// Thin wrapper around the `yaml` library that centralises parsing and, most
// importantly, *deterministic* serialization. The whole point of the plugin is
// that a single edit produces a single-line git diff, so serialization options
// are fixed here rather than scattered across the UI.

/** Options tuned for stable, block-style, one-value-per-line output. */
const STRINGIFY_OPTIONS: ToStringOptions = {
	// Never wrap long scalars onto multiple lines — wrapping churns diffs.
	lineWidth: 0,
	// Prefer block collections over flow (`{}` / `[]`) for non-empty data.
	defaultKeyType: null,
	defaultStringType: "PLAIN",
	// Keep null explicit and quoting minimal for readable diffs.
	nullStr: "null",
};

export interface ParseResult {
	/** The parsed JavaScript value (object, array, scalar, or undefined). */
	value: unknown;
	/** True if the source contained comments (not preserved on round-trip). */
	hasComments: boolean;
	/** True if the source used anchors/aliases (not preserved on round-trip). */
	hasAnchors: boolean;
}

/**
 * Parse YAML text into a plain JavaScript value and report round-trip hazards.
 * Throws on invalid YAML — callers should catch and surface the message.
 */
export function parseYaml(text: string): ParseResult {
	// Use parseDocument to inspect comments/anchors without a second parse pass.
	const doc = parseDocument(text);
	if (doc.errors.length > 0) {
		throw new Error(doc.errors[0].message);
	}
	const value = doc.toJS({ maxAliasCount: -1 });
	return {
		value,
		hasComments: documentHasComments(doc),
		hasAnchors: /(^|\s)[&*][A-Za-z0-9_-]+/.test(text),
	};
}

/**
 * Serialize a JavaScript value back to deterministic block-style YAML.
 * An empty document serializes to an empty string.
 */
export function serializeYaml(value: unknown): string {
	if (value === undefined) {
		return "";
	}
	return stringify(value, STRINGIFY_OPTIONS);
}

/** Parse without the round-trip diagnostics — used where only the value matters. */
export function parseYamlValue(text: string): unknown {
	return parse(text, { maxAliasCount: -1 });
}

export interface MetaParseResult extends ParseResult {
	/**
	 * Obsidian-style frontmatter: a leading `---` mapping document. Null when the
	 * file has no frontmatter block. The `value` field holds the body document.
	 */
	frontmatter: Record<string, unknown> | null;
}

function isPlainMap(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse YAML that may carry an Obsidian-style frontmatter block. In a `.yaml`
 * file this is a leading document mapping fenced by `---`, followed by the body
 * document — a valid two-document YAML stream:
 *
 *     ---
 *     title: My BOM
 *     ---
 *     - part: Bolt
 *
 * When no such leading map document is present the whole file is the body and
 * `frontmatter` is null.
 */
export function parseYamlWithMeta(text: string): MetaParseResult {
	const docs = parseAllDocuments(text);
	for (const doc of docs) {
		if (doc.errors.length > 0) throw new Error(doc.errors[0].message);
	}

	if (docs.length >= 2) {
		const fm = docs[0].toJS({ maxAliasCount: -1 });
		if (isPlainMap(fm)) {
			const body = docs[1].toJS({ maxAliasCount: -1 });
			return {
				value: body,
				frontmatter: fm,
				hasComments: docs.some((d) => documentHasComments(d)),
				hasAnchors: /(^|\s)[&*][A-Za-z0-9_-]+/.test(text),
			};
		}
	}

	const single = parseYaml(text);
	return { ...single, frontmatter: null };
}

/** Serialize a body value together with optional frontmatter as a YAML stream. */
export function serializeYamlWithMeta(
	frontmatter: Record<string, unknown> | null,
	value: unknown
): string {
	const body = serializeYaml(value);
	if (!frontmatter || Object.keys(frontmatter).length === 0) {
		return body;
	}
	// A two-document stream: the frontmatter map, then the body. `stringify`
	// already terminates the map with a newline.
	return "---\n" + stringify(frontmatter, STRINGIFY_OPTIONS) + "---\n" + body;
}

function documentHasComments(doc: {
	commentBefore?: string | null;
	comment?: string | null;
	contents?: unknown;
}): boolean {
	if (doc.commentBefore || doc.comment) {
		return true;
	}
	let found = false;
	// Walk nodes looking for any attached comment.
	const stack: unknown[] = [doc.contents];
	while (stack.length > 0 && !found) {
		const node = stack.pop() as { comment?: string; commentBefore?: string; items?: unknown[]; value?: unknown; key?: unknown } | null;
		if (!node || typeof node !== "object") {
			continue;
		}
		if (node.comment || node.commentBefore) {
			found = true;
			break;
		}
		if (Array.isArray(node.items)) {
			stack.push(...node.items);
		}
		if (node.key !== undefined) {
			stack.push(node.key);
		}
		if (node.value !== undefined) {
			stack.push(node.value);
		}
	}
	return found;
}
