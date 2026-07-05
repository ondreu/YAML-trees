// Visual demo: mounts the real TableRenderer against the browser DOM so we can
// screenshot the actual spreadsheet UI. Obsidian's HTMLElement helpers are
// polyfilled here (Obsidian adds them at runtime; a plain browser lacks them).

import { TableRenderer } from "../src/view/TableRenderer";
import { FormRenderer } from "../src/view/FormRenderer";
import type { EditorHost } from "../src/view/Renderer";

interface ElOptions {
	cls?: string | string[];
	text?: string;
	type?: string;
	attr?: Record<string, string>;
}

function installObsidianDomHelpers(): void {
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;

	function createEl(this: HTMLElement, tag: string, o: ElOptions = {}): HTMLElement {
		const el = document.createElement(tag);
		if (o.cls) {
			const classes = Array.isArray(o.cls) ? o.cls : o.cls.split(/\s+/);
			el.classList.add(...classes.filter(Boolean));
		}
		if (o.text !== undefined) el.textContent = o.text;
		if (o.type) el.setAttribute("type", o.type);
		if (o.attr) {
			for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, v);
		}
		this.appendChild(el);
		return el;
	}

	proto.createEl = createEl;
	proto.createDiv = function (this: HTMLElement, o?: ElOptions) {
		return createEl.call(this, "div", o);
	};
	proto.createSpan = function (this: HTMLElement, o?: ElOptions) {
		return createEl.call(this, "span", o);
	};
	proto.empty = function (this: HTMLElement) {
		while (this.firstChild) this.removeChild(this.firstChild);
	};
	proto.addClass = function (this: HTMLElement, ...c: string[]) {
		this.classList.add(...c);
	};
	proto.removeClass = function (this: HTMLElement, ...c: string[]) {
		this.classList.remove(...c);
	};
	proto.hasClass = function (this: HTMLElement, c: string) {
		return this.classList.contains(c);
	};
	proto.toggleClass = function (this: HTMLElement, c: string, on: boolean) {
		this.classList.toggle(c, on);
	};
	proto.setAttr = function (this: HTMLElement, k: string, v: string) {
		this.setAttribute(k, v);
	};
	proto.setText = function (this: HTMLElement, t: string) {
		this.textContent = t;
	};
	proto.hide = function (this: HTMLElement) {
		this.style.display = "none";
	};
	proto.show = function (this: HTMLElement) {
		this.style.display = "";
	};
}

function makeHost(initial: unknown, factory: () => { render(): void }): EditorHost {
	let data = initial;
	return {
		app: {} as never,
		baseName: () => "Demo BOM",
		ruleSet: () => ({
			rules: [
				{ column: "part", required: true },
				{ column: "supplier", enum: ["In-house", "Bolts Ltd", "JLC"] },
			],
		}),
		getData: () => data,
		replaceData: (v: unknown) => {
			data = v;
			factory().render();
		},
		replaceDataQuiet: (v: unknown) => {
			data = v;
		},
		touch: () => {},
		rerender: () => factory().render(),
	};
}

// Mirror of YamlView.buildRibbon, for visually verifying the shipped styles.css.
function buildRibbon(ribbon: HTMLElement, mode: "table" | "form"): void {
	const group = (cap: string): HTMLElement => {
		const g = ribbon.createDiv({ cls: "yt-rgroup" });
		const body = g.createDiv({ cls: "yt-rgroup-body" });
		g.createDiv({ cls: "yt-rgroup-cap", text: cap });
		return body;
	};
	const div = () => ribbon.createDiv({ cls: "yt-rdiv" });
	const rb = (body: HTMLElement, label: string, active = false): void => {
		const b = body.createEl("button", {
			cls: active ? "yt-rb is-active" : "yt-rb",
		});
		b.createSpan({ cls: "yt-rb-icon" });
		b.createSpan({ cls: "yt-rb-label", text: label });
	};
	const mini = (col: HTMLElement, label: string): void => {
		const b = col.createEl("button", { cls: "yt-rb-mini" });
		b.createSpan({ cls: "yt-rb-mini-icon" });
		b.createSpan({ text: label });
	};

	const view = group("View");
	rb(view, "Table", mode === "table");
	rb(view, "Form", mode === "form");
	rb(view, "Source");

	if (mode === "table") {
		div();
		const insert = group("Insert");
		rb(insert, "Row");
		rb(insert, "Column");
		rb(insert, "Sub-table");
		div();
		const edit = group("Edit");
		const a = edit.createDiv({ cls: "yt-rb-mini-col" });
		mini(a, "Duplicate");
		mini(a, "Fill down");
		const b = edit.createDiv({ cls: "yt-rb-mini-col" });
		mini(b, "Delete row");
		mini(b, "Delete column");
		div();
		const history = group("History");
		const h = history.createDiv({ cls: "yt-rb-mini-col" });
		mini(h, "Undo");
		mini(h, "Redo");
		div();
		rb(group("Reuse"), "Components");
	}

	div();
	const data = group("Data");
	rb(data, "Find");
	rb(data, "Flatten");
	rb(data, "Import");
	rb(data, "Lint");
	div();
	const exp = group("Export");
	rb(exp, "CSV");
	rb(exp, "Excel");
	rb(exp, "HTML");
}

function mountView(
	mount: HTMLElement,
	title: string,
	mode: "table" | "form",
	data: unknown
): void {
	const card = mount.createDiv();
	card.createEl("h2", { text: title });
	const view = card.createDiv({ cls: "yaml-databases-view" });
	view.style.height = mode === "table" ? "320px" : "360px";
	view.style.border = "1px solid var(--background-modifier-border)";
	view.style.borderRadius = "8px";

	buildRibbon(view.createDiv({ cls: "yt-ribbon" }), mode);
	const editor = view.createDiv({ cls: "yt-editor" });
	let inst: { render(): void };
	const host = makeHost(data, () => inst);
	inst = mode === "table" ? new TableRenderer(editor, host) : new FormRenderer(editor, host);
	inst.render();
}

installObsidianDomHelpers();

// Mimic Obsidian's body.is-mobile class at narrow widths so the compact ribbon
// rules can be verified in the demo.
if (window.innerWidth < 600) {
	document.body.classList.add("is-mobile");
}

const app = document.body.createDiv();
app.id = "app";

mountView(app, "Table view (bill of materials, with a subassembly)", "table", [
	{
		part: "Main assembly",
		qty: 1,
		supplier: "In-house",
		inStock: true,
		components: [
			{ part: "M3x8 bolt", qty: 12 },
			{ part: "M3 nut", qty: 12 },
		],
	},
	{ part: "007 washer", qty: 24, supplier: "Bolts Ltd", inStock: false },
	{ part: "PCB v2", qty: 1, supplier: "JLC", inStock: true },
]);

mountView(app, "Form view (nested map)", "form", {
	project: "Widget",
	revision: 4,
	released: false,
	dimensions: { width: 40, height: 15 },
	tags: ["mechanical", "rev-b"],
});
