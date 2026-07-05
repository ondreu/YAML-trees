// Pure record-table operations shared by the table renderer. Kept free of DOM
// so they can be unit-tested and reused by copy/paste, drag-and-drop, etc.

import { collectColumns } from "./shape";
import { coerceScalar, formatScalar, isEditableScalar } from "./coerce";

/** Move an item within an array in place. No-op if indices are out of range. */
export function moveItem<T>(arr: T[], from: number, to: number): void {
	if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) {
		return;
	}
	const [moved] = arr.splice(from, 1);
	arr.splice(to, 0, moved);
}

/** Reorder the keys of every record to match `order`, in place. */
export function reorderColumns(
	records: Record<string, unknown>[],
	order: string[]
): void {
	for (const record of records) {
		const rebuilt: Record<string, unknown> = {};
		for (const key of order) {
			if (key in record) rebuilt[key] = record[key];
		}
		for (const key of Object.keys(record)) {
			if (!(key in rebuilt)) rebuilt[key] = record[key];
		}
		for (const key of Object.keys(record)) delete record[key];
		Object.assign(record, rebuilt);
	}
}

/**
 * Serialise a rectangular block of cells to TSV (Excel clipboard format).
 * Rows/cols are inclusive index ranges into `records`/`columns`.
 */
export function rangeToTsv(
	records: Record<string, unknown>[],
	columns: string[],
	r1: number,
	c1: number,
	r2: number,
	c2: number
): string {
	const rowStart = Math.min(r1, r2);
	const rowEnd = Math.max(r1, r2);
	const colStart = Math.min(c1, c2);
	const colEnd = Math.max(c1, c2);
	const lines: string[] = [];
	for (let r = rowStart; r <= rowEnd; r++) {
		const cells: string[] = [];
		for (let c = colStart; c <= colEnd; c++) {
			const value = records[r]?.[columns[c]];
			const text = isEditableScalar(value)
				? formatScalar(value)
				: JSON.stringify(value);
			// Tabs/newlines inside a cell would corrupt the grid; replace them.
			cells.push(text.replace(/\t/g, " ").replace(/\r?\n/g, " "));
		}
		lines.push(cells.join("\t"));
	}
	return lines.join("\n");
}

/** Parse TSV/CSV-ish clipboard text into a 2D array of raw strings. */
export function parseClipboardTable(text: string): string[][] {
	const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const rows = normalized.replace(/\n$/, "").split("\n");
	return rows.map((line) => line.split("\t"));
}

/**
 * Paste a 2D block of raw strings into `records` at (startRow, startCol),
 * growing rows and columns as needed. Values are type-inferred. Mutates and
 * returns the records array.
 */
export function applyPaste(
	records: Record<string, unknown>[],
	columns: string[],
	startRow: number,
	startCol: number,
	block: string[][]
): Record<string, unknown>[] {
	const cols = [...columns];

	block.forEach((rowValues, dr) => {
		const r = startRow + dr;
		while (records.length <= r) {
			const blank: Record<string, unknown> = {};
			for (const c of cols) blank[c] = null;
			records.push(blank);
		}
		rowValues.forEach((raw, dc) => {
			const c = startCol + dc;
			// Add columns on demand.
			while (cols.length <= c) {
				const name = nextColumnName(cols);
				cols.push(name);
				for (const rec of records) {
					if (!(name in rec)) rec[name] = null;
				}
			}
			records[r][cols[c]] = coerceScalar(raw);
		});
	});

	return records;
}

/**
 * Merge an explicit display order with the actual column set. Columns named in
 * `order` come first, in that order (skipping any that no longer exist); columns
 * absent from `order` (newly added) keep their natural position at the end. This
 * lets the table honour a user's column reordering even for sparse columns that
 * only appear in some records.
 */
export function mergeColumnOrder(
	columns: string[],
	order: string[] | null
): string[] {
	if (!order) return columns;
	const present = new Set(columns);
	const preferred = order.filter((c) => present.has(c));
	const seen = new Set(preferred);
	const rest = columns.filter((c) => !seen.has(c));
	return [...preferred, ...rest];
}

/** A column name not already present, like "field 1". */
export function nextColumnName(existing: string[]): string {
	const set = new Set(existing);
	for (let i = 1; i < 100000; i++) {
		const name = `field ${i}`;
		if (!set.has(name)) return name;
	}
	return `field ${Date.now()}`;
}

/** Blank record seeded with the given columns set to null. */
export function blankRow(columns: string[]): Record<string, unknown> {
	const row: Record<string, unknown> = {};
	for (const c of columns) row[c] = null;
	return row;
}

/** Deep clone of records (for duplicate / copy of whole objects). */
export function cloneRecords(
	records: Record<string, unknown>[]
): Record<string, unknown>[] {
	return records.map((r) => structuredClone(r));
}

export { collectColumns };
