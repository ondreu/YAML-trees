// Minimal .xlsx (OOXML SpreadsheetML) writer. One worksheet, inline strings so
// there is no shared-string table to maintain. Numbers and booleans keep their
// native cell types; everything else is written as text.

import { makeZip, utf8, type ZipEntry } from "./zip";

function xmlEscape(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Column index (0-based) to spreadsheet letters: 0 -> A, 26 -> AA. */
export function columnLetter(index: number): string {
	let n = index;
	let letters = "";
	do {
		letters = String.fromCharCode(65 + (n % 26)) + letters;
		n = Math.floor(n / 26) - 1;
	} while (n >= 0);
	return letters;
}

function cellXml(ref: string, value: unknown): string {
	if (value === null || value === undefined || value === "") {
		return `<c r="${ref}"/>`;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return `<c r="${ref}"><v>${value}</v></c>`;
	}
	if (typeof value === "boolean") {
		return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
	}
	const text =
		typeof value === "object" ? JSON.stringify(value) : String(value);
	return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
		text
	)}</t></is></c>`;
}

function sheetXml(
	records: Record<string, unknown>[],
	columns: string[]
): string {
	const rows: string[] = [];

	// Header row.
	const header = columns
		.map((c, i) => cellXml(`${columnLetter(i)}1`, c))
		.join("");
	rows.push(`<row r="1">${header}</row>`);

	// Data rows.
	records.forEach((record, r) => {
		const cells = columns
			.map((c, i) => cellXml(`${columnLetter(i)}${r + 2}`, record[c]))
			.join("");
		rows.push(`<row r="${r + 2}">${cells}</row>`);
	});

	return (
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
		`<sheetData>${rows.join("")}</sheetData>` +
		"</worksheet>"
	);
}

/** Build a single-sheet .xlsx workbook as bytes. */
export function recordsToXlsx(
	records: Record<string, unknown>[],
	columns: string[],
	sheetName = "Sheet1"
): Uint8Array {
	const safeName = xmlEscape(sheetName).slice(0, 31) || "Sheet1";

	const parts: ZipEntry[] = [
		{
			name: "[Content_Types].xml",
			data: utf8(
				'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
					'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
					'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
					'<Default Extension="xml" ContentType="application/xml"/>' +
					'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
					'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
					"</Types>"
			),
		},
		{
			name: "_rels/.rels",
			data: utf8(
				'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
					'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
					'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
					"</Relationships>"
			),
		},
		{
			name: "xl/workbook.xml",
			data: utf8(
				'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
					'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
					`<sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets>` +
					"</workbook>"
			),
		},
		{
			name: "xl/_rels/workbook.xml.rels",
			data: utf8(
				'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
					'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
					'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
					"</Relationships>"
			),
		},
		{
			name: "xl/worksheets/sheet1.xml",
			data: utf8(sheetXml(records, columns)),
		},
	];

	return makeZip(parts);
}
