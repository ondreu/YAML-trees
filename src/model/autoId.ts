// Assign hierarchical, nested-friendly IDs to every record in a BOM. Top-level
// parts are numbered 1, 2, 3...; a sub-assembly's parts extend their parent's
// id (1.1, 1.2, 1.2.1...), which is the conventional indented-BOM numbering.

import { isRecords } from "./flatten";

/**
 * Assign an `id` (or a custom key) to every record in `records`, recursing into
 * any sub-tables. IDs are hierarchical strings ("1", "1.1", "1.2.1"). The id is
 * moved to the front of each record so it reads as the first column. Returns the
 * number of records that were numbered.
 */
export function assignIds(
	records: Record<string, unknown>[],
	key = "id"
): number {
	let count = 0;

	const walk = (recs: Record<string, unknown>[], prefix: string): void => {
		recs.forEach((rec, i) => {
			const id = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;

			// Rebuild the record with the id first, preserving the rest of the order.
			const rest: Record<string, unknown> = {};
			for (const k of Object.keys(rec)) {
				if (k !== key) rest[k] = rec[k];
			}
			for (const k of Object.keys(rec)) delete rec[k];
			rec[key] = id;
			for (const k of Object.keys(rest)) rec[k] = rest[k];
			count++;

			// Recurse into any nested sub-tables, extending this record's id.
			for (const k of Object.keys(rec)) {
				if (isRecords(rec[k])) {
					walk(rec[k] as Record<string, unknown>[], id);
				}
			}
		});
	};

	walk(records, "");
	return count;
}
