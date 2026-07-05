// Parse CSV text into records. Handles quoted fields (commas, newlines,
// escaped double quotes). The first non-empty row is the header.

import { coerceScalar } from "../model/coerce";

/** Parse CSV into a 2D array of raw string fields (RFC 4180-ish). */
export function parseCsvGrid(text: string): string[][] {
	const rows: string[][] = [];
	let field = "";
	let row: string[] = [];
	let inQuotes = false;
	let i = 0;

	const pushField = () => {
		row.push(field);
		field = "";
	};
	const pushRow = () => {
		pushField();
		rows.push(row);
		row = [];
	};

	while (i < text.length) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
				} else {
					inQuotes = false;
					i++;
				}
			} else {
				field += ch;
				i++;
			}
		} else if (ch === '"') {
			inQuotes = true;
			i++;
		} else if (ch === ",") {
			pushField();
			i++;
		} else if (ch === "\r") {
			i++; // handled by the following \n (or ignored)
		} else if (ch === "\n") {
			pushRow();
			i++;
		} else {
			field += ch;
			i++;
		}
	}
	// Flush trailing field/row unless the input ended on a newline.
	if (field !== "" || row.length > 0) {
		pushRow();
	}
	return rows;
}

/** Parse CSV into records, inferring scalar types for each value. */
export function parseCsv(text: string): Record<string, unknown>[] {
	const grid = parseCsvGrid(text).filter(
		(r) => !(r.length === 1 && r[0].trim() === "")
	);
	if (grid.length === 0) return [];
	const headers = grid[0].map((h, i) => h.trim() || `field ${i + 1}`);
	const records: Record<string, unknown>[] = [];
	for (let r = 1; r < grid.length; r++) {
		const record: Record<string, unknown> = {};
		headers.forEach((h, c) => {
			record[h] = coerceScalar(grid[r][c] ?? "");
		});
		records.push(record);
	}
	return records;
}
