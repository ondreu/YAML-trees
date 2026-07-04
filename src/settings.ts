import { App, PluginSettingTab, Setting } from "obsidian";
import type YamlTreesPlugin from "./main";
import type { ViewMode } from "./constants";

export interface YamlTreesSettings {
	/** Which editing mode a freshly opened file starts in. */
	defaultView: ViewMode;
	/** Base name used for newly created databases (before the number suffix). */
	newFileBaseName: string;
	/** YAML content written into a newly created database. */
	newFileTemplate: string;
}

export const DEFAULT_SETTINGS: YamlTreesSettings = {
	defaultView: "table",
	newFileBaseName: "Untitled",
	newFileTemplate: "- name: Example item\n  quantity: 1\n",
};

export class YamlTreesSettingTab extends PluginSettingTab {
	private readonly plugin: YamlTreesPlugin;

	constructor(app: App, plugin: YamlTreesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

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
	}
}
