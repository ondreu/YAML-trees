import { Notice, TextFileView, WorkspaceLeaf, setIcon } from "obsidian";
import type YamlTreesPlugin from "../main";
import { VIEW_TYPE_YAML, ICONS, type ViewMode } from "../constants";
import { parseYaml, serializeYaml } from "../model/YamlDocument";
import { detectShape } from "../model/shape";
import { EditorHost, Renderer } from "./Renderer";
import { TableRenderer } from "./TableRenderer";
import { FormRenderer } from "./FormRenderer";
import { SourceRenderer } from "./SourceRenderer";

// The custom main-area view for `.yaml` / `.yml` files. Extends TextFileView so
// Obsidian handles the file load/save lifecycle; we only supply get/setViewData
// and render the parsed model through the active renderer.

export class YamlView extends TextFileView implements EditorHost {
	private readonly plugin: YamlTreesPlugin;

	/** Parsed model (the source of truth while the file is open). */
	private model: unknown = undefined;
	/** Current editing mode. */
	private mode: ViewMode;
	/** Container the active renderer draws into. */
	private editorEl!: HTMLElement;
	private activeRenderer: Renderer | null = null;
	/** Mode-switch buttons in the header, keyed by mode. */
	private modeButtons: Partial<Record<ViewMode, HTMLElement>> = {};
	/** Whether the last parse hit an unrecoverable error. */
	private parseError: string | null = null;

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

	/** Called by Obsidian to get the text to write to disk. */
	getViewData(): string {
		if (this.parseError !== null) {
			// Never overwrite a file we failed to parse — return the raw data.
			return this.data;
		}
		return serializeYaml(this.model);
	}

	/** Called by Obsidian when the file content is (re)loaded. */
	setViewData(data: string, clear: boolean): void {
		this.data = data;
		if (clear) {
			this.clear();
		}
		try {
			const result = parseYaml(data);
			this.model = result.value;
			this.parseError = null;
			if (result.hasComments || result.hasAnchors) {
				this.warnRoundTrip(result.hasComments, result.hasAnchors);
			}
			// Records default to table; everything else defaults to form, unless
			// the user explicitly picked a mode already this session.
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
		this.activeRenderer = null;
		this.contentEl.empty();
	}

	// --- EditorHost contract ---------------------------------------------

	getData(): unknown {
		return this.model;
	}

	replaceData(value: unknown): void {
		this.model = value;
		this.requestSave();
		this.renderActive();
	}

	replaceDataQuiet(value: unknown): void {
		this.model = value;
		this.requestSave();
	}

	touch(): void {
		this.requestSave();
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

		this.buildModeSwitcher(root);
		this.editorEl = root.createDiv({ cls: "yt-editor" });
	}

	private buildModeSwitcher(root: HTMLElement): void {
		const bar = root.createDiv({ cls: "yt-modebar" });
		this.modeButtons = {};
		const modes: { mode: ViewMode; icon: string; label: string }[] = [
			{ mode: "table", icon: ICONS.table, label: "Table" },
			{ mode: "form", icon: ICONS.form, label: "Form" },
			{ mode: "source", icon: ICONS.source, label: "Source" },
		];
		for (const { mode, icon, label } of modes) {
			const btn = bar.createEl("button", { cls: "yt-mode-btn" });
			setIcon(btn.createSpan({ cls: "yt-btn-icon" }), icon);
			btn.createSpan({ text: label });
			btn.addEventListener("click", () => this.setMode(mode));
			this.modeButtons[mode] = btn;
		}
		this.updateModeButtons();
	}

	private setMode(mode: ViewMode): void {
		if (this.mode === mode) {
			return;
		}
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
		if (this.parseError !== null || !this.editorEl) {
			return;
		}
		this.editorEl.empty();
		this.activeRenderer = this.createRenderer(this.mode);
		this.activeRenderer.render();
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
		// Only auto-pick when the user hasn't diverged from the configured default.
		if (this.mode !== this.plugin.settings.defaultView) {
			return;
		}
		const shape = detectShape(this.model);
		if (this.plugin.settings.defaultView === "table" && shape !== "records") {
			this.mode = shape === "scalar" ? "source" : "form";
		}
	}

	private warnRoundTrip(hasComments: boolean, hasAnchors: boolean): void {
		const parts: string[] = [];
		if (hasComments) parts.push("comments");
		if (hasAnchors) parts.push("anchors/aliases");
		new Notice(
			`YAML Trees: this file contains ${parts.join(" and ")}, which are not preserved when edited here.`,
			8000
		);
	}
}
