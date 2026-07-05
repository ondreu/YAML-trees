// CSV export for a list of records. Values are flattened to text; nested
// structures are serialised as compact JSON so nothing is silently dropped.

function cellToText(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (typeof value === "object") {
		return JSON.stringify(value);
	}
	return String(value);
}

/** Quote a field for CSV if it contains a comma, quote, or newline. */
function escapeField(text: string): string {
	if (/[",\r\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

/**
 * Render records to CSV text. Uses CRLF line endings (Excel-friendly) and a
 * header row of the given columns.
 */
export function recordsToCsv(
	records: Record<string, unknown>[],
	columns: string[]
): string {
	const lines: string[] = [];
	lines.push(columns.map((c) => escapeField(c)).join(","));
	for (const record of records) {
		lines.push(
			columns.map((c) => escapeField(cellToText(record[c]))).join(",")
		);
	}
	return lines.join("\r\n") + "\r\n";
}
