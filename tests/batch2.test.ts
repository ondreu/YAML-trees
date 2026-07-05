import { test } from "node:test";
import assert from "node:assert/strict";
import { compareCells, computeView } from "../src/model/sort";
import { parseCsv, parseCsvGrid } from "../src/import/csvRead";
import { parseXlsx } from "../src/import/xlsxRead";
import { recordsToXlsx } from "../src/export/xlsx";
import { recordsToCsv } from "../src/export/csv";

test("compareCells: numbers, strings, empties last", () => {
	assert.ok(compareCells(1, 2) < 0);
	assert.ok(compareCells(2, 1) > 0);
	assert.ok(compareCells("a", "b") < 0);
	assert.ok(compareCells(null, 5) > 0); // empties sort last
	assert.ok(compareCells(5, null) < 0);
	assert.equal(compareCells(null, ""), 0);
});

test("computeView: filter then sort, returns real indices", () => {
	const recs = [
		{ part: "bolt", qty: 3 },
		{ part: "nut", qty: 1 },
		{ part: "washer", qty: 2 },
	];
	const cols = ["part", "qty"];

	// Sort by qty asc.
	assert.deepEqual(computeView(recs, cols, { sortColumn: "qty", sortDir: "asc" }), [1, 2, 0]);
	// Sort desc.
	assert.deepEqual(computeView(recs, cols, { sortColumn: "qty", sortDir: "desc" }), [0, 2, 1]);
	// Filter.
	assert.deepEqual(computeView(recs, cols, { filter: "nut" }), [1]);
	// Filter + sort.
	assert.deepEqual(
		computeView(recs, cols, { filter: "t", sortColumn: "qty", sortDir: "asc" }),
		[1, 0]
	);
});

test("CSV grid handles quotes, commas and newlines", () => {
	const grid = parseCsvGrid('a,b\r\n"x,y","line\nbreak"\r\n');
	assert.deepEqual(grid, [
		["a", "b"],
		["x,y", "line\nbreak"],
	]);
});

test("parseCsv infers types and headers", () => {
	const recs = parseCsv("part,qty,ok\nBolt,4,true\n007,2,false\n");
	assert.deepEqual(recs, [
		{ part: "Bolt", qty: 4, ok: true },
		{ part: "007", qty: 2, ok: false }, // leading-zero stays a string
	]);
});

test("CSV round-trips through export + import", () => {
	const recs = [
		{ part: "Nut, M3", qty: 8 },
		{ part: "Bolt", qty: 4 },
	];
	const csv = recordsToCsv(recs, ["part", "qty"]);
	assert.deepEqual(parseCsv(csv), recs);
});

test("XLSX round-trips through export + import", async () => {
	const recs = [
		{ part: "Bolt", qty: 4, ok: true },
		{ part: "Nut, M3", qty: 8, ok: false },
	];
	const bytes = recordsToXlsx(recs, ["part", "qty", "ok"], "BOM");
	const parsed = await parseXlsx(bytes);
	assert.deepEqual(parsed, recs);
});
