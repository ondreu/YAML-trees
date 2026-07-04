// Shared constants for the YAML Trees plugin.

/** Workspace view type used when registering the YAML editor view. */
export const VIEW_TYPE_YAML = "yaml-trees-view";

/** File extensions this plugin claims and can open in its custom view. */
export const YAML_EXTENSIONS = ["yaml", "yml"];

/** Lucide icon ids used across the UI. */
export const ICONS = {
	view: "sheet",
	create: "sheet",
	table: "table",
	form: "list",
	source: "code",
} as const;

/** Editing modes offered by the view. */
export type ViewMode = "table" | "form" | "source";
