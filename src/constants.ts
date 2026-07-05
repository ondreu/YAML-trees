// Shared constants for the YAML Databases plugin.

/** Workspace view type used when registering the YAML editor view. */
export const VIEW_TYPE_YAML = "yaml-trees-view";

/**
 * Suffix that marks a Markdown file as a YAML database (`example.yaml.md`).
 *
 * The plugin stores YAML inside `.md` files so Obsidian treats them as notes:
 * the leading `---` frontmatter block is indexed as properties (Bases /
 * metadata compatible) and git diffs stay line-by-line. The body is raw YAML
 * rendered by this plugin's view, not as Markdown prose.
 */
export const YAML_MD_SUFFIX = ".yaml.md";

/** True when `path` is a YAML-database Markdown file. */
export function isYamlDbFile(path: string): boolean {
	return path.toLowerCase().endsWith(YAML_MD_SUFFIX);
}

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
