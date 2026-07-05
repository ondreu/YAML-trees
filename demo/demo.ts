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

function mountView(
	mount: HTMLElement,
	title: string,
	mode: "table" | "form",
	data: unknown
): void {
	const card = mount.createDiv();
	card.createEl("h2", { text: title });
	const view = card.createDiv({ cls: "yaml-trees-view" });
	view.style.height = mode === "table" ? "260px" : "320px";
	view.style.border = "1px solid var(--background-modifier-border)";
	view.style.borderRadius = "8px";

	const bar = view.createDiv({ cls: "yt-modebar" });
	(["Table", "Form", "Source"] as const).forEach((label) => {
		const active = label.toLowerCase() === mode;
		const btn = bar.createEl("button", {
			cls: active ? "yt-mode-btn is-active" : "yt-mode-btn",
		});
		btn.createSpan({ cls: "yt-btn-icon" });
		btn.createSpan({ text: label });
	});

	const editor = view.createDiv({ cls: "yt-editor" });
	let inst: { render(): void };
	const host = makeHost(data, () => inst);
	inst = mode === "table" ? new TableRenderer(editor, host) : new FormRenderer(editor, host);
	inst.render();
}

installObsidianDomHelpers();

const app = document.body.createDiv();
app.id = "app";

mountView(app, "Table view (bill of materials)", "table", [
	{ part: "M3x8 bolt", qty: 12, supplier: "Acme", inStock: true },
	{ part: "M3 nut", qty: 12, supplier: "Acme", inStock: true },
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
