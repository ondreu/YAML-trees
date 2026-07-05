import {
	Notice,
	TextFileView,
	WorkspaceLeaf,
	normalizePath,
	setIcon,
} from "obsidian";
import type YamlTreesPlugin from "../main";
import { VIEW_TYPE_YAML, ICONS, type ViewMode } from "../constants";
import { parseYaml, serializeYaml } from "../model/YamlDocument";
import { detectShape, collectColumns, isPlainObject } from "../model/shape";
import { EditorHost, Renderer } from "./Renderer";
import { TableRenderer } from "./TableRenderer";
import { FormRenderer } from "./FormRenderer";
import { SourceRenderer } from "./SourceRenderer";
import { recordsToCsv } from "../export/csv";
import { recordsToXlsx } from "../export/xlsx";
import { exportHtml } from "../export/html";
import { parseRules, lintRecords, type Diagnostic } from "../lint/lint";

// The custom main-area view for `.yaml` / `.yml` files. Extends TextFileView so
// Obsidian handles the file load/save lifecycle; we supply get/setViewData and
// render the parsed model through the active renderer, plus export and lint.

function asRecords(value: unknown): Record<string, unknown>[] | null {
	return Array.isArray(value) && value.every(isPlainObject)
		? (value as Record<string, unknown>[])
		: null;
}

export class YamlView extends TextFileView implements EditorHost {
	private readonly plugin: YamlTreesPlugin;

	private model: unknown = undefined;
	private mode: ViewMode;
	private editorEl!: HTMLElement;
	private lintEl!: HTMLElement;
	/** Renderer instances cached per mode so their state (drill path, column
	 * widths) survives data changes and mode switches. */
	private renderers: Partial<Record<ViewMode, Renderer>> = {};
	private modeButtons: Partial<Record<ViewMode, HTMLElement>> = {};
	private parseError: string | null = null;
	private lintVisible = false;

	constructor(leaf: WorkspaceLeaf, plugin: YamlTreesPlugin) {
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
		return serializeYaml(this.model);
	}

	setViewData(data: string, clear: boolean): void {
		this.data = data;
		if (clear) {
			this.clear();
		}
		this.renderers = {};
		try {
			const result = parseYaml(data);
			this.model = result.value;
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
		this.parseError = null;
		this.renderers = {};
		this.contentEl.empty();
	}

	// --- EditorHost contract ---------------------------------------------
	// `app` is inherited from TextFileView and satisfies EditorHost.

	baseName(): string {
		return this.file?.basename ?? "database";
	}

	getData(): unknown {
		return this.model;
	}

	replaceData(value: unknown): void {
		this.model = value;
		this.requestSave();
		this.renderActive();
		this.refreshLint();
	}

	replaceDataQuiet(value: unknown): void {
		this.model = value;
		this.requestSave();
		this.refreshLint();
	}

	touch(): void {
		this.requestSave();
		this.refreshLint();
	}

	rerender(): void {
		this.renderActive();
	}

	// --- Layout & rendering ----------------------------------------------

	private buildLayout(): void {
		this.contentEl.empty();
		const root = this.contentEl.createDiv({ cls: "yaml-trees-view" });

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

		this.buildToolbar(root);
		this.lintEl = root.createDiv({ cls: "yt-lint" });
		this.lintEl.hide();
		this.editorEl = root.createDiv({ cls: "yt-editor" });
	}

	private buildToolbar(root: HTMLElement): void {
		const bar = root.createDiv({ cls: "yt-modebar" });

		// Mode switch (segmented).
		const modes: { mode: ViewMode; icon: string; label: string }[] = [
			{ mode: "table", icon: ICONS.table, label: "Table" },
			{ mode: "form", icon: ICONS.form, label: "Form" },
			{ mode: "source", icon: ICONS.source, label: "Source" },
		];
		const group = bar.createDiv({ cls: "yt-mode-group" });
		this.modeButtons = {};
		for (const { mode, icon, label } of modes) {
			const btn = group.createEl("button", { cls: "yt-mode-btn" });
			setIcon(btn.createSpan({ cls: "yt-btn-icon" }), icon);
			btn.createSpan({ text: label });
			btn.addEventListener("click", () => this.setMode(mode));
			this.modeButtons[mode] = btn;
		}
		this.updateModeButtons();

		// Spacer + action buttons.
		bar.createDiv({ cls: "yt-modebar-spacer" });
		this.toolbarButton(bar, "check-circle", "Lint", () => this.toggleLint());
		this.toolbarButton(bar, "download", "CSV", () => this.exportCsv());
		this.toolbarButton(bar, "download", "XLSX", () => this.exportXlsx());
		this.toolbarButton(bar, "code", "HTML", () => this.exportHtmlFile());
	}

	private toolbarButton(
		bar: HTMLElement,
		icon: string,
		label: string,
		onClick: () => void
	): void {
		const btn = bar.createEl("button", { cls: "yt-tool-btn", attr: { "aria-label": label } });
		setIcon(btn.createSpan({ cls: "yt-btn-icon" }), icon);
		btn.createSpan({ text: label });
		btn.addEventListener("click", onClick);
	}

	private setMode(mode: ViewMode): void {
		if (this.mode === mode) return;
		this.mode = mode;
		this.updateModeButtons();
		this.renderActive();
	}

	private updateModeButtons(): void {
		for (const mode of Object.keys(this.modeButtons) as ViewMode[]) {
			this.modeButtons[mode]?.toggleClass("is-active", this.mode === mode);
		}
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
		return { records, columns: collectColumns(records) };
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
			exportHtml(this.model, this.baseName())
		);
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
