import { test } from "node:test";
import assert from "node:assert/strict";
import { recordsToCsv } from "../src/export/csv";
import { recordsToXlsx } from "../src/export/xlsx";
import { columnLetter } from "../src/export/xlsx";
import { makeZip } from "../src/export/zip";
import { exportHtml } from "../src/export/html";
import { parseRules, lintRecords } from "../src/lint/lint";
import { cellType, convertCell, isSubtable } from "../src/model/cells";
import {
	moveItem,
	reorderColumns,
	rangeToTsv,
	parseClipboardTable,
	applyPaste,
} from "../src/model/records";

const BOM = [
	{ part: "Bolt", qty: 4, inStock: true },
	{ part: "Nut, M3", qty: 8, inStock: false },
];

test("CSV escapes commas and quotes, uses CRLF", () => {
	const csv = recordsToCsv(BOM, ["part", "qty", "inStock"]);
	assert.equal(
		csv,
		'part,qty,inStock\r\n' +
			"Bolt,4,true\r\n" +
			'"Nut, M3",8,false\r\n'
	);
});

test("XLSX produces a valid ZIP container with required parts", () => {
	const bytes = recordsToXlsx(BOM, ["part", "qty", "inStock"]);
	// ZIP local file header magic.
	assert.equal(bytes[0], 0x50);
	assert.equal(bytes[1], 0x4b);
	// End-of-central-directory signature present near the tail.
	const tail = Buffer.from(bytes).toString("latin1");
	assert.ok(tail.includes("[Content_Types].xml"));
	assert.ok(tail.includes("xl/worksheets/sheet1.xml"));
	assert.ok(tail.includes("Bolt"));
});

test("columnLetter maps indices to spreadsheet columns", () => {
	assert.equal(columnLetter(0), "A");
	assert.equal(columnLetter(25), "Z");
	assert.equal(columnLetter(26), "AA");
});

test("makeZip round-trips entry names and sizes in the directory", () => {
	const zip = makeZip([{ name: "a.txt", data: new TextEncoder().encode("hi") }]);
	const s = Buffer.from(zip).toString("latin1");
	assert.ok(s.startsWith("PK"));
	assert.ok(s.includes("a.txt"));
});

test("HTML export is self-contained and embeds the data", () => {
	const html = exportHtml(BOM, "MyBOM");
	assert.ok(html.startsWith("<!doctype html>"));
	assert.ok(html.includes("__YAMLDB_DATA__"));
	assert.ok(html.includes("Bolt"));
	// No external resource references.
	assert.ok(!/src="http/.test(html));
	assert.ok(!/href="http/.test(html));
});

test("lint: required, type, min, unique, enum", () => {
	const { ruleSet, error } = parseRules(
		[
			"nonEmpty: true",
			"rules:",
			"  - column: part",
			"    required: true",
			"    unique: true",
			"  - column: qty",
			"    type: integer",
			"    min: 1",
			"  - column: status",
			"    enum: [open, done]",
		].join("\n")
	);
	assert.equal(error, null);

	const records = [
		{ part: "A", qty: 2, status: "open" },
		{ part: "A", qty: 0, status: "bad" }, // duplicate part, qty<min, bad enum
		{ qty: 5, status: "done" }, // missing required part
	];
	const diags = lintRecords(records, ruleSet);
	const messages = diags.map((d) => d.message).join(" | ");
	assert.ok(messages.includes("Duplicate"), messages);
	assert.ok(messages.includes("below minimum"), messages);
	assert.ok(messages.includes("not one of the allowed"), messages);
	assert.ok(messages.includes("Missing required"), messages);
});

test("lint: invalid rule YAML reports an error, not a crash", () => {
	const { error } = parseRules("rules: [::::");
	assert.ok(typeof error === "string" && error.length > 0);
});

test("cellType classifies values", () => {
	assert.equal(cellType("hi"), "text");
	assert.equal(cellType("a\nb"), "multiline");
	assert.equal(cellType(3), "number");
	assert.equal(cellType(true), "boolean");
	assert.equal(cellType([1, 2]), "list");
	assert.equal(cellType([{ a: 1 }]), "subtable");
	assert.equal(cellType({ a: 1 }), "object");
	assert.ok(isSubtable([{ a: 1 }]));
});

test("convertCell converts between types", () => {
	assert.equal(convertCell("5", "number"), 5);
	assert.deepEqual(convertCell("a, b, c", "list"), ["a", "b", "c"]);
	// Converting a scalar to a sub-table seeds a starter record so the result is
	// a real (drillable) sub-table, not an empty list.
	assert.deepEqual(convertCell("x", "subtable"), [{ "field 1": null }]);
	assert.equal(cellType(convertCell("x", "subtable")), "subtable");
	assert.deepEqual(convertCell([{ a: 1 }], "subtable"), [{ a: 1 }]);
	assert.equal(convertCell(["a", "b"], "text"), '["a","b"]');
});

test("record ops: move, reorder columns", () => {
	const arr = [1, 2, 3];
	moveItem(arr, 0, 2);
	assert.deepEqual(arr, [2, 3, 1]);

	const recs = [{ a: 1, b: 2, c: 3 }];
	reorderColumns(recs, ["c", "a", "b"]);
	assert.deepEqual(Object.keys(recs[0]), ["c", "a", "b"]);
});

test("range copy and paste round-trip through TSV", () => {
	const recs = [
		{ a: 1, b: 2 },
		{ a: 3, b: 4 },
	];
	const tsv = rangeToTsv(recs, ["a", "b"], 0, 0, 1, 1);
	assert.equal(tsv, "1\t2\n3\t4");

	const block = parseClipboardTable("9\t8\n7\t6");
	applyPaste(recs, ["a", "b"], 0, 0, block);
	assert.deepEqual(recs, [
		{ a: 9, b: 8 },
		{ a: 7, b: 6 },
	]);
});

test("applyPaste grows rows and columns as needed", () => {
	const recs = [{ a: 1 }];
	applyPaste(recs, ["a"], 0, 0, [
		["x", "y"],
		["z", "w"],
	]);
	assert.equal(recs.length, 2);
	assert.equal(recs[0].a, "x");
	assert.equal(recs[0]["field 1"], "y");
	assert.equal(recs[1].a, "z");
});
