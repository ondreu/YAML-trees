import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeColumnOrder } from "../src/model/records";
import { explodeForExport } from "../src/model/flatten";
import { cellType } from "../src/model/cells";
import { assignIds } from "../src/model/autoId";
import {
	parseYamlWithMeta,
	serializeYamlWithMeta,
} from "../src/model/YamlDocument";

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

// --- Auto-ID (nested-friendly hierarchical IDs) -----------------------------

test("assignIds numbers records hierarchically, id first, recursing sub-tables", () => {
	const bom = [
		{ name: "A", bom: [{ name: "A-bolt" }, { name: "A-nut" }] },
		{ name: "B" },
	];
	const n = assignIds(bom);
	assert.equal(n, 4);
	assert.equal(bom[0].id, "1");
	// id is the first key.
	assert.equal(Object.keys(bom[0])[0], "id");
	const sub = bom[0].bom as Record<string, unknown>[];
	assert.equal(sub[0].id, "1.1");
	assert.equal(sub[1].id, "1.2");
	assert.equal(bom[1].id, "2");
});

test("assignIds overwrites existing ids consistently", () => {
	const bom = [{ id: "old", name: "A" }];
	assignIds(bom);
	assert.equal(bom[0].id, "1");
	assert.equal(Object.keys(bom[0]).join(","), "id,name");
});

// --- Metadata / frontmatter round-trip --------------------------------------

test("parseYamlWithMeta splits a leading frontmatter document from the body", () => {
	const text = "---\ntitle: My BOM\nrev: 3\n---\n- part: Bolt\n  qty: 4\n";
	const r = parseYamlWithMeta(text);
	assert.deepEqual(r.frontmatter, { title: "My BOM", rev: 3 });
	assert.deepEqual(r.value, [{ part: "Bolt", qty: 4 }]);
});

test("parseYamlWithMeta treats a plain file as having no frontmatter", () => {
	const r = parseYamlWithMeta("- part: Bolt\n  qty: 4\n");
	assert.equal(r.frontmatter, null);
	assert.deepEqual(r.value, [{ part: "Bolt", qty: 4 }]);
});

test("a leading --- on a single document is not mistaken for frontmatter", () => {
	const r = parseYamlWithMeta("---\n- part: Bolt\n");
	assert.equal(r.frontmatter, null);
	assert.deepEqual(r.value, [{ part: "Bolt" }]);
});

test("serializeYamlWithMeta round-trips through parseYamlWithMeta", () => {
	const fm = { title: "My BOM", rev: 3 };
	const body = [{ part: "Bolt", qty: 4 }];
	const text = serializeYamlWithMeta(fm, body);
	assert.ok(text.startsWith("---\n"));
	const back = parseYamlWithMeta(text);
	assert.deepEqual(back.frontmatter, fm);
	assert.deepEqual(back.value, body);
});

test("serializeYamlWithMeta with empty frontmatter emits only the body", () => {
	const text = serializeYamlWithMeta(null, [{ part: "Bolt" }]);
	assert.ok(!text.startsWith("---"));
	assert.equal(serializeYamlWithMeta({}, [{ part: "Bolt" }]), text);
});

// --- YAML syntax highlighter -------------------------------------------------

import { highlightYaml } from "../src/view/yamlHighlight";

function stripHtml(html: string): string {
	return html
		.replace(/<[^>]+>/g, "")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

test("highlightYaml preserves the exact source text (caret alignment)", () => {
	const src = [
		"---",
		"title: My BOM",
		"items:",
		"  - part: Bolt   # a fastener",
		"    qty: 4",
		'    note: "a: b > c & <d>"',
		"    ok: true",
		"    spare: null",
		"",
	].join("\n");
	assert.equal(stripHtml(highlightYaml(src)), src);
});

test("highlightYaml tags keys, numbers, booleans, comments and markers", () => {
	const html = highlightYaml("part: Bolt\nqty: 4\nok: true\n# c\n---");
	assert.match(html, /yt-yl-key">part/);
	assert.match(html, /yt-yl-number">4/);
	assert.match(html, /yt-yl-bool">true/);
	assert.match(html, /yt-yl-comment"># c/);
	assert.match(html, /yt-yl-marker">---/);
});

test("highlightYaml escapes HTML metacharacters", () => {
	const html = highlightYaml("x: <script>");
	assert.ok(!html.includes("<script>"));
	assert.match(html, /&lt;script&gt;/);
});
