import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeColumnOrder } from "../src/model/records";
import { explodeForExport } from "../src/model/flatten";
import { cellType } from "../src/model/cells";

// --- Column-order override (fixes: cannot move columns near sub-tables) ------

test("mergeColumnOrder honours an explicit order for present columns", () => {
	const cols = ["a", "b", "c"];
	assert.deepEqual(mergeColumnOrder(cols, ["c", "a", "b"]), ["c", "a", "b"]);
});

test("mergeColumnOrder keeps a sparse column moved even if collectColumns would reorder", () => {
	// `note` exists only in a later record, so a naive union puts it last. The
	// override must still place it where the user moved it.
	const union = ["name", "bom", "note"];
	const moved = mergeColumnOrder(union, ["name", "note", "bom"]);
	assert.deepEqual(moved, ["name", "note", "bom"]);
});

test("mergeColumnOrder drops stale names and appends new ones", () => {
	const cols = ["a", "b", "new"];
	// order references a deleted column "gone" and misses the freshly added "new".
	assert.deepEqual(mergeColumnOrder(cols, ["gone", "b", "a"]), ["b", "a", "new"]);
});

test("mergeColumnOrder with no override returns columns unchanged", () => {
	assert.deepEqual(mergeColumnOrder(["a", "b"], null), ["a", "b"]);
});

// --- Sub-table seeding (fixes: sub-table button just adds a column) ----------

test("a seeded sub-table cell classifies as a sub-table, not a list", () => {
	// The fix seeds new sub-table cells with a starter record.
	assert.equal(cellType([{ "field 1": null }]), "subtable");
	// The old empty-array seed classified as a plain list (the bug).
	assert.equal(cellType([]), "list");
});

// --- Excel-friendly hierarchical export -------------------------------------

const NESTED_BOM = [
	{
		name: "Assembly A",
		qty: 1,
		bom: [
			{ name: "Bolt", qty: 4 },
			{ name: "Bracket", qty: 2, bom: [{ name: "Rivet", qty: 6 }] },
		],
	},
	{ name: "Widget", qty: 3 },
];

test("explodeForExport expands sub-assemblies into indented child rows", () => {
	const { records, columns } = explodeForExport(NESTED_BOM);
	assert.deepEqual(columns, ["Level", "name", "qty"]);
	// The sub-table column itself is not emitted as a data column.
	assert.ok(!columns.includes("bom"));
	// One row per part across all levels: A, Bolt, Bracket, Rivet, Widget.
	assert.equal(records.length, 5);
	assert.deepEqual(records[0], { Level: 1, name: "Assembly A", qty: 1 });
	assert.deepEqual(records[1], { Level: 2, name: "    Bolt", qty: 4 });
	assert.deepEqual(records[2], { Level: 2, name: "    Bracket", qty: 2 });
	assert.deepEqual(records[3], { Level: 3, name: "        Rivet", qty: 6 });
	assert.deepEqual(records[4], { Level: 1, name: "Widget", qty: 3 });
});

test("explodeForExport leaves a flat database untouched (no Level column)", () => {
	const flat = [
		{ part: "Bolt", qty: 4 },
		{ part: "Nut", qty: 8 },
	];
	const { records, columns } = explodeForExport(flat);
	assert.deepEqual(columns, ["part", "qty"]);
	assert.equal(records, flat); // same array, no transform
});
