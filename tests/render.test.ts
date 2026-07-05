import { test } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./obsidian-dom-shim";
import { TableRenderer } from "../src/view/TableRenderer";
import { SourceRenderer } from "../src/view/SourceRenderer";
import { FormRenderer } from "../src/view/FormRenderer";
import { serializeYaml } from "../src/model/YamlDocument";
import type { EditorHost } from "../src/view/Renderer";

const document = installDom();
const win = document.defaultView as unknown as { Event: typeof Event; MouseEvent: typeof MouseEvent };

interface TestHost extends EditorHost {
	rerenders: number;
	current(): unknown;
}

/** A host that re-renders through the given renderer factory on structural changes. */
function makeHost(initial: unknown, renderer?: () => TableRenderer): TestHost {
	let data = initial;
	let rerenders = 0;
	const host: TestHost = {
		app: {} as never,
		baseName: () => "test",
		ruleSet: () => ({}),
		getData: () => data,
		replaceData: (v: unknown) => {
			data = v;
			renderer?.().render();
		},
		replaceDataQuiet: (v: unknown) => {
			data = v;
		},
		touch: () => {},
		rerender: () => {
			rerenders++;
			renderer?.().render();
		},
		comments: () => null,
		getComment: () => undefined,
		setComment: () => {},
		getSourceText: () => serializeYaml(data),
		setSourceText: () => {},
		rerenders: 0,
		current: () => data,
	};
	Object.defineProperty(host, "rerenders", { get: () => rerenders });
	return host;
}

function fire(el: Element, type: string): void {
	el.dispatchEvent(new win.Event(type, { bubbles: true }));
}

function allText(container: HTMLElement): string {
	let text = container.textContent ?? "";
	container.querySelectorAll("input").forEach((i) => {
		text += " " + (i as HTMLInputElement).value;
		text += " " + ((i as HTMLInputElement).placeholder ?? "");
	});
	return text;
}

test("renders a spreadsheet grid for a record list", () => {
	const container = document.createElement("div");
	const host = makeHost([
		{ name: "Bolt", quantity: 4 },
		{ name: "Nut", quantity: 8 },
	]);
	new TableRenderer(container, host).render();

	assert.ok(container.querySelector("table.yt-sheet"), "table exists");

	const heads = Array.from(
		container.querySelectorAll<HTMLInputElement>(".yt-colhead-input")
	).map((i) => i.value);
	assert.deepEqual(heads, ["name", "quantity"]);

	const rownums = Array.from(
		container.querySelectorAll(".yt-rownum")
	).map((e) => e.textContent);
	assert.deepEqual(rownums, ["1", "2"]);

	const cell = container.querySelector<HTMLInputElement>(
		'.yt-cell-input[data-row="0"][data-col="0"]'
	);
	assert.equal(cell?.value, "Bolt");

	assert.ok(container.querySelector(".yt-addrow-cell"), "add-row footer exists");
	assert.ok(container.querySelector(".yt-addcol"), "add-column control exists");
});

test("editing a cell updates the model and does NOT re-render", () => {
	const container = document.createElement("div");
	const host = makeHost([{ name: "Bolt", quantity: 4 }]);
	new TableRenderer(container, host).render();

	const cell = container.querySelector<HTMLInputElement>(
		'.yt-cell-input[data-row="0"][data-col="1"]'
	)!;
	cell.value = "12";
	fire(cell, "change");

	assert.deepEqual(host.current(), [{ name: "Bolt", quantity: 12 }]);
	assert.equal(host.rerenders, 0, "cell edit must not trigger a re-render");
});

test("rendered DOM is ASCII-only (no CJK-fallback glyphs)", () => {
	const container = document.createElement("div");
	const host = makeHost([
		{ part: "007", nested: { a: 1 }, list: [1, 2], missing: null },
	]);
	new TableRenderer(container, host).render();

	const text = allText(container);
	assert.ok(
		/^[\x00-\x7F]*$/.test(text),
		`non-ASCII in rendered table: ${JSON.stringify(text)}`
	);
});

test("empty document offers to start a table", () => {
	const container = document.createElement("div");
	let inst: TableRenderer;
	const host = makeHost(undefined, () => inst);
	inst = new TableRenderer(container, host);
	inst.render();

	assert.ok(container.querySelector(".yt-empty"), "empty state shown");
	const button = container.querySelector<HTMLButtonElement>(".yt-btn")!;
	fire(button, "click");

	assert.deepEqual(host.current(), [{ "field 1": null }]);
	assert.ok(
		container.querySelector("table.yt-sheet"),
		"table appears after starting"
	);
});

test("adding a column extends every row", () => {
	const container = document.createElement("div");
	let inst: TableRenderer;
	const host = makeHost([{ name: "Bolt" }], () => inst);
	inst = new TableRenderer(container, host);
	inst.render();

	const addcol = container.querySelector<HTMLElement>(".yt-addcol")!;
	fire(addcol, "click");

	const heads = Array.from(
		container.querySelectorAll<HTMLInputElement>(".yt-colhead-input")
	).map((i) => i.value);
	assert.deepEqual(heads, ["name", "field 1"]);
	assert.deepEqual(host.current(), [{ name: "Bolt", "field 1": null }]);
});

test("a seeded sub-table cell renders drill + expand affordances", () => {
	const container = document.createElement("div");
	let inst: TableRenderer;
	const host = makeHost(
		[{ name: "Assembly", bom: [{ part: "Bolt", qty: 4 }] }],
		() => inst
	);
	inst = new TableRenderer(container, host);
	inst.render();

	// The sub-table cell shows a drill button ("N rows") and an expander.
	assert.ok(container.querySelector(".yt-drill"), "expected a drill button");
	assert.ok(container.querySelector(".yt-subexpand"), "expected an expander");
});

test("every row gutter has a grabber grip handle", () => {
	const container = document.createElement("div");
	let inst: TableRenderer;
	const host = makeHost([{ name: "Bolt" }, { name: "Nut" }], () => inst);
	inst = new TableRenderer(container, host);
	inst.render();

	const grips = container.querySelectorAll(".yt-row-grip");
	assert.equal(grips.length, 2);
});

test("Source view highlights YAML behind an aligned transparent textarea", () => {
	const container = document.createElement("div");
	const host = makeHost([{ part: "Bolt", qty: 4 }]);
	new SourceRenderer(container, host).render();

	const textarea = container.querySelector<HTMLTextAreaElement>(
		".yt-source-input"
	)!;
	const code = container.querySelector<HTMLElement>(".yt-source-highlight code")!;
	assert.ok(textarea, "expected a textarea");
	assert.ok(code.innerHTML.includes("yt-yl-key"), "expected highlighted tokens");
	// The highlight layer's visible text must match the textarea exactly.
	assert.equal(code.textContent, textarea.value);
});

test("Form view renders nested groups as separated cards", () => {
	const container = document.createElement("div");
	const host = makeHost({ name: "Assembly", specs: { weight: 5, color: "red" } });
	new FormRenderer(container, host).render();

	const group = container.querySelector(".yt-group");
	assert.ok(group, "expected a nested group card");
	assert.ok(group!.querySelector(".yt-group-header"), "expected a group header");
	assert.ok(group!.querySelector(".yt-group-body"), "expected a group body");
});

test("cmdAddSubtable converts only the selected cell, not the whole column", () => {
	const container = document.createElement("div");
	let inst: TableRenderer;
	const host = makeHost(
		[
			{ name: "Bolt", detail: null },
			{ name: "Nut", detail: null },
		],
		() => inst
	);
	inst = new TableRenderer(container, host);
	inst.render();

	// Select the "detail" cell of row 0, then run the ribbon Sub-table command.
	const cell = container.querySelector<HTMLInputElement>(
		'.yt-cell-input[data-row="0"][data-col="1"]'
	)!;
	cell.dispatchEvent(new win.Event("focus", { bubbles: true }));
	inst.cmdAddSubtable();

	const data = host.current() as Record<string, unknown>[];
	// Only row 0's chosen field became a sub-table; row 1 is untouched.
	assert.ok(Array.isArray(data[0].detail), "row 0 detail is a sub-table");
	assert.equal(data[1].detail, null, "row 1 detail unchanged");
	// No new column was added.
	assert.deepEqual(Object.keys(data[0]), ["name", "detail"]);
	// And the converted cell renders as a drillable sub-table.
	assert.ok(container.querySelector(".yt-drill"), "drillable cell rendered");
});

test("cell menu Sub-table type makes a drillable sub-table (RMB path)", () => {
	const container = document.createElement("div");
	let inst: TableRenderer;
	const host = makeHost([{ name: "Bolt", detail: null }], () => inst);
	inst = new TableRenderer(container, host);
	inst.render();

	// Right-click the cell to open its type menu, then pick "Sub-table".
	const td = container.querySelector<HTMLElement>(
		'.yt-cell[data-row]'
	) ?? container.querySelectorAll<HTMLElement>(".yt-cell")[1];
	td.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true }));
	const item = (globalThis as any).__lastMenu?.find(
		(m: { title: string }) => m.title === "Sub-table"
	);
	assert.ok(item, "Sub-table menu item exists");
	item.click();

	const data = host.current() as Record<string, unknown>[];
	assert.ok(Array.isArray(data[0].detail), "cell became a sub-table array");
	assert.equal((data[0].detail as unknown[]).length, 1, "seeded with a record");
});

// --- YAML syntax highlighter -------------------------------------------------

import { highlightYaml } from "../src/view/yamlHighlight";

function highlightToHtml(src: string): string {
	const parent = document.createElement("div");
	highlightYaml(parent, src);
	return parent.innerHTML;
}

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
	assert.equal(stripHtml(highlightToHtml(src)), src);
});

test("highlightYaml tags keys, numbers, booleans, comments and markers", () => {
	const html = highlightToHtml("part: Bolt\nqty: 4\nok: true\n# c\n---");
	assert.match(html, /yt-yl-key">part/);
	assert.match(html, /yt-yl-number">4/);
	assert.match(html, /yt-yl-bool">true/);
	assert.match(html, /yt-yl-comment"># c/);
	assert.match(html, /yt-yl-marker">---/);
});

test("highlightYaml escapes HTML metacharacters", () => {
	const html = highlightToHtml("x: <script>");
	assert.ok(!html.includes("<script>"));
	assert.match(html, /&lt;script&gt;/);
});

// --- Per-cell comments -------------------------------------------------------

import {
	parseYamlWithMeta,
	serializeYamlWithMeta,
} from "../src/model/YamlDocument";

test("cell comments round-trip through parse -> serialize", () => {
	const src = [
		"- part: Bolt   # a fastener",
		"  qty: 4",
		"- part: Nut",
		"  qty: 8  # eight",
	].join("\n");
	const result = parseYamlWithMeta(src);
	assert.ok(result.commentMap, "comment map was populated");
	const records = result.value as Record<string, unknown>[];
	assert.equal(result.commentMap!.get(records[0])?.get("part"), " a fastener");
	assert.equal(result.commentMap!.get(records[1])?.get("qty"), " eight");
	const out = serializeYamlWithMeta(result.frontmatter, result.value, result.commentMap);
	assert.match(out, /part: Bolt # a fastener/);
	assert.match(out, /qty: 8 # eight/);
	// Cells without comments are untouched.
	assert.match(out, /  qty: 4$/m);
});

test("cell comments survive reordering (WeakMap keyed by record object)", () => {
	const src = [
		"- part: Bolt   # fastener",
		"  qty: 4",
		"- part: Nut",
		"  qty: 8",
	].join("\n");
	const result = parseYamlWithMeta(src);
	const records = result.value as Record<string, unknown>[];
	const bolt = records[0];
	// Swap rows: Nut first, Bolt second.
	records.push(records.shift()!);
	assert.equal(records[1], bolt, "Bolt object moved to index 1");
	// Comment should still resolve on the Bolt object.
	assert.equal(result.commentMap!.get(bolt)?.get("part"), " fastener");
	const out = serializeYamlWithMeta(null, records, result.commentMap);
	assert.match(out, /part: Bolt # fastener/);
});

// --- Source view shows frontmatter + comments -------------------------------

test("Source view shows frontmatter and comments via getSourceText", () => {
	const src = "---\ntitle: My BOM\n---\n- part: Bolt  # fastener\n  qty: 4\n";
	const result = parseYamlWithMeta(src);
	const container = document.createElement("div");
	const host: EditorHost = {
		app: {} as never,
		baseName: () => "test",
		ruleSet: () => ({}),
		getData: () => result.value,
		replaceData: () => {},
		replaceDataQuiet: () => {},
		touch: () => {},
		rerender: () => {},
		comments: () => result.commentMap,
		getComment: () => undefined,
		setComment: () => {},
		getSourceText: () =>
			serializeYamlWithMeta(result.frontmatter, result.value, result.commentMap),
		setSourceText: () => {},
	};
	new SourceRenderer(container, host).render();
	const textarea = container.querySelector<HTMLTextAreaElement>(".yt-source-input")!;
	assert.match(textarea.value, /^---\ntitle: My BOM/);
	assert.match(textarea.value, /part: Bolt # fastener/);
});

// --- Form view shows comment indicator --------------------------------------

test("Form view shows comment marker on commented fields", () => {
	const result = parseYamlWithMeta("part: Bolt  # fastener\nqty: 4\n");
	const obj = result.value as Record<string, unknown>;
	const container = document.createElement("div");
	const host: EditorHost = {
		app: {} as never,
		baseName: () => "test",
		ruleSet: () => ({}),
		getData: () => obj,
		replaceData: () => {},
		replaceDataQuiet: () => {},
		touch: () => {},
		rerender: () => {},
		comments: () => result.commentMap,
		getComment: (c, k) => result.commentMap?.get(c)?.get(k),
		setComment: () => {},
		getSourceText: () => "",
		setSourceText: () => {},
	};
	new FormRenderer(container, host).render();
	const commented = container.querySelector<HTMLElement>(".yt-field-commented");
	assert.ok(commented, "expected a commented field marker");
	assert.match(commented!.getAttribute("title")!, /#\s+fastener/);
});

