// View-only sort and filter for a records table. These never mutate the model;
// they return an ordering of real row indices so cell edits still target the
// underlying record objects.

export type SortDir = "asc" | "desc";

/** Compare two cell values: nulls/empties last, numbers numeric, else text. */
export function compareCells(a: unknown, b: unknown): number {
	const ea = a === null || a === undefined || a === "";
	const eb = b === null || b === undefined || b === "";
	if (ea && eb) return 0;
	if (ea) return 1;
	if (eb) return -1;
	if (typeof a === "number" && typeof b === "number") return a - b;
	if (typeof a === "boolean" && typeof b === "boolean") {
		return a === b ? 0 : a ? 1 : -1;
	}
	return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function rowText(record: Record<string, unknown>, columns: string[]): string {
	return columns
		.map((c) => {
			const v = record[c];
			return v === null || v === undefined ? "" : String(v);
		})
		.join(" ")
		.toLowerCase();
}

export interface ViewOptions {
	sortColumn?: string | null;
	sortDir?: SortDir;
	filter?: string;
}

/**
 * Produce the display order (array of real indices) after filtering then
 * sorting. A stable sort preserves original order for equal keys.
 */
export function computeView(
	records: Record<string, unknown>[],
	columns: string[],
	opts: ViewOptions
): number[] {
	let indices = records.map((_, i) => i);

	const filter = opts.filter?.trim().toLowerCase();
	if (filter) {
		indices = indices.filter((i) => rowText(records[i], columns).includes(filter));
	}

	if (opts.sortColumn) {
		const col = opts.sortColumn;
		const dir = opts.sortDir === "desc" ? -1 : 1;
		indices = indices
			.map((i) => ({ i, key: records[i][col] }))
			.sort((a, b) => compareCells(a.key, b.key) * dir || a.i - b.i)
			.map((x) => x.i);
	}

	return indices;
}
