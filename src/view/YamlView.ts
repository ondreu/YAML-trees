import {
	Notice,
	TextFileView,
	WorkspaceLeaf,
	normalizePath,
	setIcon,
} from "obsidian";
import type YamlDatabasesPlugin from "../main";
import { VIEW_TYPE_YAML, ICONS, type ViewMode } from "../constants";
import {
	parseYamlWithMeta,
	serializeYamlWithMeta,
} from "../model/YamlDocument";
import { coerceScalar, formatScalar } from "../model/coerce";
import { detectShape, collectColumns, isPlainObject } from "../model/shape";
import { EditorHost, Renderer } from "./Renderer";
import { TableRenderer } from "./TableRenderer";
import { FormRenderer } from "./FormRenderer";
import { SourceRenderer } from "./SourceRenderer";
import { recordsToCsv } from "../export/csv";
import { recordsToXlsx } from "../export/xlsx";
import { exportHtml } from "../export/html";
import { parseRules, lintRecords, type Diagnostic } from "../lint/lint";
import { countMatches, replaceAll, type FindOptions } from "../model/find";
import { collectComponents } from "../model/dedupe";
import { explodeForExport } from "../model/flatten";
import { assignIds } from "../model/autoId";
import { FindReplaceModal } from "./modals/FindReplaceModal";
import { ComponentsModal } from "./modals/ComponentsModal";
import { FlattenModal } from "./modals/FlattenModal";
import { parseCsv } from "../import/csvRead";
import { parseXlsx } from "../import/xlsxRead";

// The custom main-area view for `.yaml.md` files (YAML stored inside Markdown
// so Obsidian indexes the frontmatter as properties). Extends TextFileView so
// Obsidian handles the file load/save lifecycle; we supply get/setViewData and
// render the parsed model through the active renderer, plus export and lint.

function asRecords(value: unknown): Record<string, unknown>[] | null {
	return Array.isArray(value) && value.every(isPlainObject)
		? (value as Record<string, unknown>[])
		: null;
}

export class YamlView extends TextFileView implements EditorHost {
	private readonly plugin: YamlDatabasesPlugin;

	private model: unknown = undefined;
	/** Obsidian-style frontmatter (leading `---` map), or null when absent. */
	private frontmatter: Record<string, unknown> | null = null;
	private metaVisible = false;
	private metaEl!: HTMLElement;
	private mode: ViewMode;
	private editorEl!: HTMLElement;
	private ribbonEl!: HTMLElement;
	private lintEl!: HTMLElement;
	/** Renderer instances cached per mode so their state (drill path, column
	 * widths) survives data changes and mode switches. */
	private renderers: Partial<Record<ViewMode, Renderer>> = {};
	private modeButtons: Partial<Record<ViewMode, HTMLElement>> = {};
	private parseError: string | null = null;
	private lintVisible = false;
	/** Undo/redo history of model snapshots. */
	private undoStack: unknown[] = [];
	private redoStack: unknown[] = [];
	private lastSnapshot: unknown = undefined;
	private suppressHistory = false;

	constructor(leaf: WorkspaceLeaf, plugin: YamlDatabasesPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.mode = plugin.settings.defaultView;
	}

	getViewType(): string {
		return VIEW_TYPE_YAML;
	}

	getIcon(): string {
		return ICONS.view;
	}

	getDisplayText(): string {
		return this.file?.basename ?? "YAML";
	}

	// --- TextFileView contract -------------------------------------------

	getViewData(): string {
		if (this.parseError !== null) {
			return this.data;
		}
		return serializeYamlWithMeta(this.frontmatter, this.model);
	}

	setViewData(data: string, clear: boolean): void {
		this.data = data;
		if (clear) {
			this.clear();
		}
		this.renderers = {};
		this.undoStack = [];
		this.redoStack = [];
		try {
			const result = parseYamlWithMeta(data);
			this.model = result.value;
			this.frontmatter = result.frontmatter;
			this.lastSnapshot = structuredClone(this.model);
			this.parseError = null;
			if (result.hasComments || result.hasAnchors) {
				this.warnRoundTrip(result.hasComments, result.hasAnchors);
			}
			this.pickInitialMode();
		} catch (e) {
			this.parseError = e instanceof Error ? e.message : String(e);
			this.model = undefined;
		}
		this.buildLayout();
		this.renderActive();
	}

	clear(): void {
		this.model = undefined;
		this.frontmatter = null;
		this.parseError = null;
		this.renderers = {};
		this.contentEl.empty();
	}

	// --- EditorHost contract ---------------------------------------------
	// `app` is inherited from TextFileView and satisfies EditorHost.

	baseName(): string {
		return this.file?.basename ?? "database";
	}

	ruleSet() {
		return parseRules(this.plugin.settings.lintRules).ruleSet;
	}

	getData(): unknown {
		return this.model;
	}

	replaceData(value: unknown): void {
		this.recordHistory();
		this.model = value;
		this.requestSave();
		this.renderActive();
		this.refreshLint();
	}

	replaceDataQuiet(value: unknown): void {
		this.recordHistory();
		this.model = value;
		this.requestSave();
		this.refreshLint();
	}

	touch(): void {
		this.recordHistory();
		this.requestSave();
		this.refreshLint();
	}

	/** Push the previous settled state onto the undo stack. */
	private recordHistory(): void {
		if (this.suppressHistory) return;
		if (this.lastSnapshot !== undefined) {
			this.undoStack.push(this.lastSnapshot);
			if (this.undoStack.length > 100) this.undoStack.shift();
		}
		this.lastSnapshot = structuredClone(this.model);
		this.redoStack = [];
	}

	private undo(): void {
		if (this.undoStack.length === 0) {
			new Notice("Nothing to undo.");
			return;
		}
		this.redoStack.push(structuredClone(this.model));
		this.restore(this.undoStack.pop());
	}

	private redo(): void {
		if (this.redoStack.length === 0) {
			new Notice("Nothing to redo.");
			return;
		}
		this.undoStack.push(structuredClone(this.model));
		this.restore(this.redoStack.pop());
	}

	private restore(snapshot: unknown): void {
		this.suppressHistory = true;
		this.model = snapshot;
		this.lastSnapshot = structuredClone(snapshot);
		this.requestSave();
		this.renderActive();
		this.refreshLint();
		this.suppressHistory = false;
	}

	rerender(): void {
		this.renderActive();
	}

	// --- Layout & rendering ----------------------------------------------

	private buildLayout(): void {
		this.contentEl.empty();
		const root = this.contentEl.createDiv({ cls: "yaml-databases-view" });

		if (this.parseError !== null) {
			const banner = root.createDiv({ cls: "yt-parse-error" });
			banner.createDiv({
				cls: "yt-parse-error-title",
				text: "Could not parse this YAML file",
			});
			banner.createDiv({ cls: "yt-parse-error-body", text: this.parseError });
			banner.createDiv({
				cls: "yt-parse-error-hint",
				text: "The file will not be modified until the syntax is valid. Fix it in your default editor and reopen.",
			});
			return;
		}

		// Undo/redo via keyboard when focus is not inside a cell editor.
		root.addEventListener("keydown", (e) => {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
			const mod = e.ctrlKey || e.metaKey;
			if (mod && (e.key === "z" || e.key === "Z")) {
				e.preventDefault();
				if (e.shiftKey) this.redo();
				else this.undo();
			} else if (mod && (e.key === "y" || e.key === "Y")) {
				e.preventDefault();
				this.redo();
			}
		});

		this.ribbonEl = root.createDiv({ cls: "yt-ribbon" });
		this.buildRibbon();
		this.metaEl = root.createDiv({ cls: "yt-meta" });
		this.metaEl.toggle(this.metaVisible);
		this.lintEl = root.createDiv({ cls: "yt-lint" });
		this.lintEl.hide();
		this.editorEl = root.createDiv({ cls: "yt-editor" });
		if (this.metaVisible) this.renderMeta();
	}

	/** Build the Excel-style ribbon. Insert/Edit groups appear only in Table mode. */
	private buildRibbon(): void {
		this.ribbonEl.empty();

		// View group: mode switch.
		const view = this.ribbonGroup("View");
		this.modeButtons = {};
		const modes: { mode: ViewMode; icon: string; label: string }[] = [
			{ mode: "table", icon: ICONS.table, label: "Table" },
			{ mode: "form", icon: ICONS.form, label: "Form" },
			{ mode: "source", icon: ICONS.source, label: "Source" },
		];
		for (const { mode, icon, label } of modes) {
			const btn = this.ribbonButton(view, icon, label, () => this.setMode(mode));
			btn.toggleClass("is-active", this.mode === mode);
			this.modeButtons[mode] = btn;
		}

		if (this.mode === "table") {
			this.ribbonDivider();
			const insert = this.ribbonGroup("Insert");
			this.ribbonButton(insert, "plus", "Row", () =>
				this.tableCmd((t) => t.cmdAddRow())
			);
			this.ribbonButton(insert, "plus", "Column", () =>
				this.tableCmd((t) => t.cmdAddColumn())
			);
			this.ribbonButton(insert, "table", "Sub-table", () =>
				this.tableCmd((t) => t.cmdAddSubtable())
			);

			this.ribbonDivider();
			const edit = this.ribbonGroup("Edit");
			// Rows/columns are reordered by dragging their handles; only the
			// destructive/duplicate actions live in the ribbon now.
			const colA = edit.createDiv({ cls: "yt-rb-mini-col" });
			this.ribbonMini(colA, "copy", "Duplicate", () =>
				this.tableCmd((t) => t.cmdDuplicateRow())
			);
			this.ribbonMini(colA, "arrow-down-to-line", "Fill down", () =>
				this.tableCmd((t) => t.cmdFillDown())
			);
			const colB = edit.createDiv({ cls: "yt-rb-mini-col" });
			this.ribbonMini(colB, "trash-2", "Delete row", () =>
				this.tableCmd((t) => t.cmdDeleteRow())
			);
			this.ribbonMini(colB, "trash", "Delete column", () =>
				this.tableCmd((t) => t.cmdDeleteColumn())
			);

			this.ribbonDivider();
			const history = this.ribbonGroup("History");
			const hcol = history.createDiv({ cls: "yt-rb-mini-col" });
			this.ribbonMini(hcol, "undo-2", "Undo", () => this.undo());
			this.ribbonMini(hcol, "redo-2", "Redo", () => this.redo());

			this.ribbonDivider();
			const reuse = this.ribbonGroup("Reuse");
			this.ribbonButton(reuse, "copy", "Components", () => this.openComponents());
		}

		this.ribbonDivider();
		const data = this.ribbonGroup("Data");
		this.ribbonButton(data, "search", "Find", () => this.openFindReplace());
		this.ribbonButton(data, "layers", "Flatten", () => this.openFlatten());
		this.ribbonButton(data, "hash", "Auto-ID", () => this.autoId());
		this.ribbonButton(data, "tags", "Metadata", () => this.toggleMeta());
		this.ribbonButton(data, "import", "Import", () => this.importFile());
		this.ribbonButton(data, "circle-check", "Lint", () => this.toggleLint());

		this.ribbonDivider();
		const exp = this.ribbonGroup("Export");
		this.ribbonButton(exp, "file-text", "CSV", () => this.exportCsv());
		this.ribbonButton(exp, "sheet", "Excel", () => this.exportXlsx());
		this.ribbonButton(exp, "file-code", "HTML", () => this.exportHtmlFile());
		this.ribbonButton(exp, "braces", "YAML", () => this.exportYaml());
	}

	private ribbonGroup(caption: string): HTMLElement {
		const group = this.ribbonEl.createDiv({ cls: "yt-rgroup" });
		const body = group.createDiv({ cls: "yt-rgroup-body" });
		group.createDiv({ cls: "yt-rgroup-cap", text: caption });
		return body;
	}

	private ribbonDivider(): void {
		this.ribbonEl.createDiv({ cls: "yt-rdiv" });
	}

	private ribbonButton(
		body: HTMLElement,
		icon: string,
		label: string,
		onClick: () => void
	): HTMLElement {
		const btn = body.createEl("button", { cls: "yt-rb", attr: { "aria-label": label } });
		setIcon(btn.createSpan({ cls: "yt-rb-icon" }), icon);
		btn.createSpan({ cls: "yt-rb-label", text: label });
		btn.addEventListener("click", onClick);
		return btn;
	}

	private ribbonMini(
		col: HTMLElement,
		icon: string,
		label: string,
		onClick: () => void
	): void {
		const btn = col.createEl("button", { cls: "yt-rb-mini" });
		setIcon(btn.createSpan({ cls: "yt-rb-mini-icon" }), icon);
		btn.createSpan({ text: label });
		btn.addEventListener("click", onClick);
	}

	/** Run a command against the live Table renderer, if we are in Table mode. */
	private tableCmd(fn: (t: TableRenderer) => void): void {
		const renderer = this.renderers["table"];
		if (renderer instanceof TableRenderer) {
			fn(renderer);
		}
	}

	private setMode(mode: ViewMode): void {
		if (this.mode === mode) return;
		this.mode = mode;
		this.buildRibbon();
		this.renderActive();
	}

	private renderActive(): void {
		if (this.parseError !== null || !this.editorEl) return;
		this.editorEl.empty();
		let renderer = this.renderers[this.mode];
		if (!renderer) {
			renderer = this.createRenderer(this.mode);
			this.renderers[this.mode] = renderer;
		}
		renderer.render();
	}

	private createRenderer(mode: ViewMode): Renderer {
		switch (mode) {
			case "table":
				return new TableRenderer(this.editorEl, this);
			case "form":
				return new FormRenderer(this.editorEl, this);
			case "source":
				return new SourceRenderer(this.editorEl, this);
		}
	}

	private pickInitialMode(): void {
		if (this.mode !== this.plugin.settings.defaultView) return;
		const shape = detectShape(this.model);
		if (this.plugin.settings.defaultView === "table" && shape !== "records") {
			this.mode = shape === "scalar" ? "source" : "form";
		}
	}

	// --- Metadata (frontmatter) ------------------------------------------

	private toggleMeta(): void {
		this.metaVisible = !this.metaVisible;
		this.metaEl.toggle(this.metaVisible);
		if (this.metaVisible) this.renderMeta();
	}

	/** Render the frontmatter editor: a list of key/value property rows. */
	private renderMeta(): void {
		if (!this.metaEl) return;
		this.metaEl.empty();

		const header = this.metaEl.createDiv({ cls: "yt-meta-header" });
		header.createSpan({ cls: "yt-meta-title", text: "Metadata" });
		header.createSpan({
			cls: "yt-meta-hint",
			text: "Obsidian-style frontmatter, saved as a leading --- block.",
		});

		const fm = this.frontmatter ?? {};
		const keys = Object.keys(fm);
		if (keys.length === 0) {
			this.metaEl.createDiv({
				cls: "yt-meta-empty",
				text: "No properties yet. Add one below.",
			});
		}

		for (const key of keys) {
			this.renderMetaRow(key, fm[key]);
		}

		// Add-property row.
		const adder = this.metaEl.createDiv({ cls: "yt-meta-row yt-meta-adder" });
		const nameInput = adder.createEl("input", {
			type: "text",
			cls: "yt-meta-key",
			attr: { placeholder: "New property", spellcheck: "false" },
		});
		const add = adder.createEl("button", { cls: "yt-btn yt-btn-subtle", text: "Add" });
		const commit = () => {
			const name = nameInput.value.trim();
			if (!name) return;
			const next = { ...(this.frontmatter ?? {}) };
			if (name in next) return;
			next[name] = null;
			this.frontmatter = next;
			this.requestSave();
			this.renderMeta();
		};
		add.addEventListener("click", commit);
		nameInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				commit();
			}
		});
	}

	private renderMetaRow(key: string, value: unknown): void {
		const row = this.metaEl.createDiv({ cls: "yt-meta-row" });
		row.createSpan({ cls: "yt-meta-key-label", text: key });

		if (typeof value === "boolean") {
			const box = row.createEl("input", { type: "checkbox", cls: "yt-meta-check" });
			box.checked = value;
			box.addEventListener("change", () => this.setMeta(key, box.checked));
		} else {
			const input = row.createEl("input", {
				type: "text",
				cls: "yt-meta-value",
				attr: { spellcheck: "false" },
			});
			input.value = formatScalar(value);
			if (value === null || value === undefined) input.placeholder = "null";
			input.addEventListener("change", () => {
				const before = typeof value;
				const next = coerceScalar(input.value);
				this.setMeta(key, next);
				if (typeof next !== before) this.renderMeta();
			});
		}

		const del = row.createSpan({ cls: "yt-icon-btn" });
		setIcon(del, "trash");
		del.setAttr("aria-label", "Delete property");
		del.addEventListener("click", () => {
			const next = { ...(this.frontmatter ?? {}) };
			delete next[key];
			this.frontmatter = Object.keys(next).length > 0 ? next : null;
			this.requestSave();
			this.renderMeta();
		});
	}

	private setMeta(key: string, value: unknown): void {
		const next = { ...(this.frontmatter ?? {}) };
		next[key] = value;
		this.frontmatter = next;
		this.requestSave();
	}

	// --- Lint ------------------------------------------------------------

	private toggleLint(): void {
		this.lintVisible = !this.lintVisible;
		this.lintEl.toggle(this.lintVisible);
		if (this.lintVisible) this.refreshLint();
	}

	private refreshLint(): void {
		if (!this.lintVisible || !this.lintEl) return;
		this.lintEl.empty();
		const records = asRecords(this.model);
		if (!records) {
			this.lintEl.createDiv({
				cls: "yt-lint-empty",
				text: "Linting applies to a list of records.",
			});
			return;
		}
		const parsed = parseRules(this.plugin.settings.lintRules);
		if (parsed.error) {
			this.lintEl.createDiv({
				cls: "yt-lint-item is-error",
				text: `Rule error: ${parsed.error}`,
			});
		}
		const diagnostics = lintRecords(records, parsed.ruleSet);
		const header = this.lintEl.createDiv({ cls: "yt-lint-header" });
		header.setText(
			diagnostics.length === 0
				? "No problems found."
				: `${diagnostics.length} problem(s)`
		);
		for (const d of diagnostics) {
			this.renderDiagnostic(d);
		}
	}

	private renderDiagnostic(d: Diagnostic): void {
		const item = this.lintEl.createDiv({
			cls: `yt-lint-item is-${d.severity}`,
		});
		const where =
			d.row !== undefined
				? `Row ${d.row + 1}${d.column ? `, ${d.column}` : ""}: `
				: "";
		item.setText(`${where}${d.message}`);
	}

	// --- Find & replace / Components / Flatten ---------------------------

	private openFindReplace(): void {
		const records = asRecords(this.model);
		const columns = records ? collectColumns(records) : [];
		new FindReplaceModal(
			this.app,
			columns,
			(opts: FindOptions) => countMatches(this.model, opts),
			(opts: FindOptions, replacement: string) => {
				const n = replaceAll(this.model, opts, replacement);
				if (n > 0) this.replaceData(this.model);
				return n;
			}
		).open();
	}

	private openComponents(): void {
		const components = collectComponents(this.model);
		if (components.length === 0) {
			new Notice("YAML Databases: no components found.");
			return;
		}
		new ComponentsModal(this.app, components, (template) => {
			this.tableCmd((t) => t.insertComponent(template));
		}).open();
	}

	private openFlatten(): void {
		const records = asRecords(this.model);
		if (!records) {
			new Notice("YAML Databases: flatten needs a list of records.");
			return;
		}
		new FlattenModal(this.app, records, (rows, columns, kind) => {
			const name = `${this.baseName()}-flat.${kind}`;
			const content =
				kind === "csv"
					? recordsToCsv(rows, columns)
					: recordsToXlsx(rows, columns, `${this.baseName()} flat`);
			void this.writeSibling(name, content);
		}).open();
	}

	private autoId(): void {
		const records = asRecords(this.model);
		if (!records) {
			new Notice("YAML Databases: Auto-ID needs a list of records.");
			return;
		}
		const n = assignIds(records);
		this.replaceData(this.model);
		new Notice(`YAML Databases: assigned ${n} hierarchical ID(s).`);
	}

	// --- Import ----------------------------------------------------------

	private importFile(): void {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".csv,.xlsx,text/csv";
		input.addEventListener("change", () => void this.handleImport(input.files?.[0]));
		input.click();
	}

	private async handleImport(file?: File | null): Promise<void> {
		if (!file) return;
		try {
			const records = file.name.toLowerCase().endsWith(".xlsx")
				? await parseXlsx(new Uint8Array(await file.arrayBuffer()))
				: parseCsv(await file.text());
			if (records.length === 0) {
				new Notice("YAML Databases: nothing to import.");
				return;
			}
			const current = asRecords(this.model);
			if (current) {
				for (const r of records) current.push(r);
				this.replaceData(this.model);
			} else {
				this.replaceData(records);
			}
			new Notice(`YAML Databases: imported ${records.length} row(s).`);
		} catch (e) {
			new Notice(
				`YAML Databases: import failed: ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}

	// --- Export ----------------------------------------------------------

	private exportRecords(): {
		records: Record<string, unknown>[];
		columns: string[];
	} | null {
		const records = asRecords(this.model);
		if (!records) {
			new Notice("YAML Databases: export needs a list of records.");
			return null;
		}
		// Sub-assemblies are exploded into indented child rows so a spreadsheet
		// shows every part on its own line instead of a JSON blob in one cell.
		return explodeForExport(records);
	}

	private async exportCsv(): Promise<void> {
		const data = this.exportRecords();
		if (!data) return;
		await this.writeSibling(
			`${this.baseName()}.csv`,
			recordsToCsv(data.records, data.columns)
		);
	}

	private async exportXlsx(): Promise<void> {
		const data = this.exportRecords();
		if (!data) return;
		await this.writeSibling(
			`${this.baseName()}.xlsx`,
			recordsToXlsx(data.records, data.columns, this.baseName())
		);
	}

	private async exportHtmlFile(): Promise<void> {
		if (!asRecords(this.model)) {
			new Notice("YAML Databases: export needs a list of records.");
			return;
		}
		await this.writeSibling(
			`${this.baseName()}.html`,
			exportHtml(this.model, this.baseName(), this.yamlText())
		);
	}

	/** Export the database as a standalone `.yaml` file (frontmatter + body). */
	private async exportYaml(): Promise<void> {
		await this.writeSibling(`${this.baseName()}.yaml`, this.yamlText());
	}

	/** Deterministic YAML serialization of the current model + frontmatter. */
	private yamlText(): string {
		return serializeYamlWithMeta(this.frontmatter, this.model);
	}

	/** Write an export next to the current file, avoiding name collisions. */
	private async writeSibling(
		fileName: string,
		content: string | Uint8Array
	): Promise<void> {
		try {
			const dir = this.file?.parent?.path ?? "";
			const base = dir && dir !== "/" ? `${dir}/` : "";
			const dot = fileName.lastIndexOf(".");
			const stem = fileName.slice(0, dot);
			const ext = fileName.slice(dot);
			let path = normalizePath(`${base}${fileName}`);
			for (let i = 1; this.app.vault.getAbstractFileByPath(path); i++) {
				path = normalizePath(`${base}${stem} ${i}${ext}`);
			}
			if (typeof content === "string") {
				await this.app.vault.create(path, content);
			} else {
				await this.app.vault.createBinary(path, content.buffer as ArrayBuffer);
			}
			new Notice(`YAML Databases: exported ${path}`);
		} catch (e) {
			new Notice(
				`YAML Databases: export failed: ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}

	private warnRoundTrip(hasComments: boolean, hasAnchors: boolean): void {
		const parts: string[] = [];
		if (hasComments) parts.push("comments");
		if (hasAnchors) parts.push("anchors/aliases");
		new Notice(
			`YAML Databases: this file contains ${parts.join(" and ")}, which are not preserved when edited here.`,
			8000
		);
	}
}
