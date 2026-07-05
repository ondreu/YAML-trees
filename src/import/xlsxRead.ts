// Read the first worksheet of an .xlsx file into records. Handles shared
// strings and inline strings; cell XML is parsed with regexes (the structure is
// simple and controlled). Works for files produced by our writer and by Excel.

import { unzip } from "./unzip";
import { coerceScalar } from "../model/coerce";

function decode(bytes: Uint8Array | undefined): string {
	return bytes ? new TextDecoder().decode(bytes) : "";
}

function xmlUnescape(s: string): string {
	return s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&");
}

/** Column letters (A, B, AA) to a 0-based index. */
function letterToIndex(letters: string): number {
	let n = 0;
	for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
	return n - 1;
}

function parseSharedStrings(xml: string): string[] {
	const strings: string[] = [];
	const siRe = /<si>([\s\S]*?)<\/si>/g;
	let m: RegExpExecArray | null;
	while ((m = siRe.exec(xml))) {
		const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) =>
			xmlUnescape(t[1])
		);
		strings.push(texts.join(""));
	}
	return strings;
}

/** Parse a worksheet into a grid of cell values keyed by [row][col]. */
function parseSheet(xml: string, shared: string[]): unknown[][] {
	const grid: unknown[][] = [];
	const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
	let rowMatch: RegExpExecArray | null;
	let r = 0;
	while ((rowMatch = rowRe.exec(xml))) {
		const cells: unknown[] = [];
		const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
		let cm: RegExpExecArray | null;
		while ((cm = cellRe.exec(rowMatch[1]))) {
			const attrs = cm[1];
			const inner = cm[2] ?? "";
			const ref = /r="([A-Z]+)\d+"/.exec(attrs);
			const col = ref ? letterToIndex(ref[1]) : cells.length;
			const type = /t="([^"]+)"/.exec(attrs)?.[1];

			let value: unknown = null;
			if (type === "s") {
				const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
				value = shared[idx] ?? "";
			} else if (type === "inlineStr") {
				const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? "";
				value = xmlUnescape(t);
			} else if (type === "b") {
				value = /<v>1<\/v>/.test(inner);
			} else {
				const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
				value = v === undefined ? null : Number(v);
			}
			cells[col] = value;
		}
		grid[r++] = cells;
	}
	return grid;
}

/** Parse the first worksheet of an xlsx into records (first row = header). */
export async function parseXlsx(
	bytes: Uint8Array
): Promise<Record<string, unknown>[]> {
	const files = await unzip(bytes);

	const sharedXml = decode(files.get("xl/sharedStrings.xml"));
	const shared = sharedXml ? parseSharedStrings(sharedXml) : [];

	// Prefer sheet1, else the first worksheet present.
	let sheetName = "xl/worksheets/sheet1.xml";
	if (!files.has(sheetName)) {
		sheetName =
			[...files.keys()].find((k) => /^xl\/worksheets\/.*\.xml$/.test(k)) ?? sheetName;
	}
	const sheetXml = decode(files.get(sheetName));
	if (!sheetXml) throw new Error("No worksheet found in xlsx.");

	const grid = parseSheet(sheetXml, shared);
	if (grid.length === 0) return [];

	const headerRow = grid[0] ?? [];
	const headers = headerRow.map((h, i) =>
		h === null || h === undefined || h === "" ? `field ${i + 1}` : String(h)
	);

	const records: Record<string, unknown>[] = [];
	for (let r = 1; r < grid.length; r++) {
		const cells = grid[r] ?? [];
		const record: Record<string, unknown> = {};
		headers.forEach((h, c) => {
			const v = cells[c];
			// Numbers/booleans keep their type; strings are re-inferred so things
			// like "007" behave consistently with the rest of the plugin.
			record[h] = typeof v === "string" ? coerceScalar(v) : v ?? null;
		});
		records.push(record);
	}
	return records;
}
