import { test } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./obsidian-dom-shim";
import { TableRenderer } from "../src/view/TableRenderer";
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
