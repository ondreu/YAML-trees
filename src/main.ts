import { Notice, Plugin, TFile, TFolder, normalizePath } from "obsidian";
import { VIEW_TYPE_YAML, YAML_EXTENSIONS, ICONS } from "./constants";
import { YamlView } from "./view/YamlView";
import {
	DEFAULT_SETTINGS,
	YamlTreesSettings,
	YamlTreesSettingTab,
} from "./settings";

export default class YamlTreesPlugin extends Plugin {
	settings!: YamlTreesSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Log the running version so the console makes it obvious which build is
		// active (useful when checking whether a beta update actually landed).
		console.log(`YAML Databases ${this.manifest.version} loaded`);

		// Custom view for editing YAML, registered for the yaml/yml extensions so
		// clicking such a file in the explorer opens it here in the main area.
		this.registerView(VIEW_TYPE_YAML, (leaf) => new YamlView(leaf, this));
		try {
			this.registerExtensions(YAML_EXTENSIONS, VIEW_TYPE_YAML);
		} catch (e) {
			// Another plugin already owns these extensions; our view can still be
			// opened explicitly via the command below.
			console.warn("YAML Trees: could not register extensions", e);
			new Notice(
				"YAML Databases: another plugin already handles .yaml/.yml files. Use the command \"Open current file in YAML Databases\" to open them here.",
				10000
			);
		}

		// "New YAML database" in the folder context menu.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFolder)) {
					return;
				}
				menu.addItem((item) =>
					item
						.setTitle("New YAML database")
						.setIcon(ICONS.create)
						.onClick(() => this.createDatabase(file))
				);
			})
		);

		// Command-palette equivalent (creates next to the active file, else root).
		this.addCommand({
			id: "create-yaml-database",
			name: "Create new YAML database",
			callback: () => this.createDatabase(this.currentFolder()),
		});

		// Force the active YAML file open in our view, even if another plugin
		// registered the extension. Essential on mobile where clicking the file
		// may route elsewhere.
		this.addCommand({
			id: "open-in-yaml-trees",
			name: "Open current file in YAML Databases",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				const eligible = !!file && YAML_EXTENSIONS.includes(file.extension);
				if (eligible && !checking) {
					void this.openInYamlView(file as TFile);
				}
				return eligible;
			},
		});

		this.addRibbonIcon(ICONS.create, "Create YAML database", () => {
			this.createDatabase(this.currentFolder());
		});

		this.addSettingTab(new YamlTreesSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Create a new YAML database in `folder` and open it in the main area. */
	private async createDatabase(folder: TFolder): Promise<void> {
		try {
			const path = this.uniquePath(folder, this.settings.newFileBaseName);
			const file = await this.app.vault.create(
				path,
				this.settings.newFileTemplate
			);
			await this.openInYamlView(file);
		} catch (e) {
			new Notice(
				`YAML Databases: could not create file: ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}

	/** Open a file in our YAML view regardless of extension ownership. */
	private async openInYamlView(file: TFile): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.setViewState({
			type: VIEW_TYPE_YAML,
			state: { file: file.path },
			active: true,
		});
	}

	/** Folder of the active file, or the vault root. */
	private currentFolder(): TFolder {
		const active = this.app.workspace.getActiveFile();
		if (active?.parent) {
			return active.parent;
		}
		return this.app.vault.getRoot();
	}

	/** First non-colliding path like `<folder>/<base>.yaml`, `<base> 1.yaml`. */
	private uniquePath(folder: TFolder, base: string): string {
		const dir = folder.isRoot() ? "" : `${folder.path}/`;
		const ext = YAML_EXTENSIONS[0];
		for (let i = 0; i < 1000; i++) {
			const name = i === 0 ? base : `${base} ${i}`;
			const candidate = normalizePath(`${dir}${name}.${ext}`);
			if (!this.app.vault.getAbstractFileByPath(candidate)) {
				return candidate;
			}
		}
		// Extremely unlikely fallback.
		return normalizePath(`${dir}${base} ${Date.now()}.${ext}`);
	}
}
