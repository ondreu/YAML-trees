import { App, PluginSettingTab, Setting } from "obsidian";
import type YamlDatabasesPlugin from "./main";
import type { ViewMode } from "./constants";

export interface YamlDatabasesSettings {
	/** Which editing mode a freshly opened file starts in. */
	defaultView: ViewMode;
	/** Base name used for newly created databases (before the number suffix). */
	newFileBaseName: string;
	/** YAML content written into a newly created database. */
	newFileTemplate: string;
	/** Declarative lint rules (YAML) applied to record tables. */
	lintRules: string;
}

export const DEFAULT_SETTINGS: YamlDatabasesSettings = {
	defaultView: "table",
	newFileBaseName: "Untitled",
	newFileTemplate: "- name: Example item\n  quantity: 1\n",
	lintRules: "",
};

const LINT_RULES_EXAMPLE = [
	"# Example rules (YAML):",
	"# nonEmpty: true",
	"# rules:",
	"#   - column: name",
	"#     required: true",
	"#     unique: true",
	"#   - column: quantity",
	"#     type: integer",
	"#     min: 0",
	"#   - column: status",
	"#     enum: [open, done]",
].join("\n");

export class YamlDatabasesSettingTab extends PluginSettingTab {
	private readonly plugin: YamlDatabasesPlugin;

	constructor(app: App, plugin: YamlDatabasesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Version line so it is easy to confirm which build is installed.
		containerEl.createEl("p", {
			cls: "yt-settings-version",
			text: `YAML Databases v${this.plugin.manifest.version}`,
		});

		new Setting(containerEl)
			.setName("Default view")
			.setDesc(
				"Which editor a YAML file opens in. Table falls back to Form when the file is not a list of records."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("table", "Table")
					.addOption("form", "Form")
					.addOption("source", "Source")
					.setValue(this.plugin.settings.defaultView)
					.onChange(async (value) => {
						this.plugin.settings.defaultView = value as ViewMode;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("New file base name")
			.setDesc("Base name for databases created from the folder menu or command.")
			.addText((text) =>
				text
					.setPlaceholder("Untitled")
					.setValue(this.plugin.settings.newFileBaseName)
					.onChange(async (value) => {
						this.plugin.settings.newFileBaseName = value.trim() || "Untitled";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("New file template")
			.setDesc("YAML content inserted into a newly created database.")
			.addTextArea((text) => {
				text
					.setValue(this.plugin.settings.newFileTemplate)
					.onChange(async (value) => {
						this.plugin.settings.newFileTemplate = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 6;
				text.inputEl.addClass("yt-settings-template");
			});

		new Setting(containerEl)
			.setName("Lint rules")
			.setDesc(
				"Declarative validation rules in YAML, applied to record tables from the Lint button. Leave empty for built-in checks only."
			)
			.addTextArea((text) => {
				text
					.setPlaceholder(LINT_RULES_EXAMPLE)
					.setValue(this.plugin.settings.lintRules)
					.onChange(async (value) => {
						this.plugin.settings.lintRules = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 10;
				text.inputEl.addClass("yt-settings-template");
			});
	}
}
