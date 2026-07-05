# YAML Databases

An [Obsidian](https://obsidian.md) plugin to **view, create and edit YAML files
as interactive databases** — through a clean, native-feeling UI as a
**spreadsheet**, a **form**, or raw **source**.

It was built for maintaining bills of materials (kusovníky) whose changes are
tracked with `git diff`, so its output is **deterministic and diff-friendly**: a
single edit produces a single-line change. It works just as well for any YAML.

> Databases are stored as **Markdown files** with a `.yaml.md` suffix
> (e.g. `bom.yaml.md`). Obsidian treats them as notes, so the leading `---`
> frontmatter block is indexed as **properties** (Bases / metadata compatible)
> and diffs stay line-by-line; the body is raw YAML rendered by this plugin.
>
> The plugin **id** is still `yaml-trees` so existing installs keep working; the
> display name is **YAML Databases**.

## Features

- **Open `.yaml.md` files in the main area** by clicking them in the file
  explorer — the plugin intercepts them and opens its own view instead of the
  default Markdown view. If another plugin grabbed the file, use the command
  *Open current file in YAML Databases*.
- **Three switchable views** (toggle in the toolbar):
  - **Table** — a spreadsheet for a list of records (rows x columns). Row
    numbers, sticky header, inline cell and column-name editing, keyboard
    navigation (Tab / Enter / arrows), **resizable columns**, **drag-to-reorder**
    rows and columns, and **Excel-style range selection with copy/paste** (TSV).
    Right-click a row number, column header, or cell for insert / move /
    duplicate / delete / clear and per-cell **type** changes.
  - **Form** — a collapsible, labelled tree for maps and nested data, with each
    nested group shown as a clearly separated card.
  - **Source** — the raw YAML with **live syntax highlighting** and validation as
    an escape hatch.
- **Sub-databases (subassemblies)** — a cell can hold a nested list of records;
  **expand** it inline to peek, or **drill in** with a breadcrumb to navigate
  back out. Insert one from the ribbon (Insert -> Sub-table).
- **Find & replace** across the whole database and its sub-tables (Data -> Find),
  scoped to a column or all, case-sensitive and whole-cell options.
- **Components** (Reuse) — a de-duplicated list of every record across the file
  and its sub-assemblies; insert a copy to reuse a block.
- **Flatten BOM** (Data -> Flatten) — roll quantities up through the sub-assembly
  tree into one parts list and export it as CSV/XLSX.
- **Auto-ID** (Data -> Auto-ID) — assign nested-friendly hierarchical IDs to
  every part and sub-assembly part (`1`, `1.1`, `1.2.1`...), the id placed first.
- **Metadata** (Data -> Metadata) — attach Obsidian-style frontmatter to a
  database, stored as a leading `---` YAML document ahead of the body (the same
  style as markdown notes). A plain file with no frontmatter is left untouched.
- **Totals footer** with column sums, a **frozen first column**, and
  **touch-friendly drag** of row numbers / column handles to reorder.
- **Sort & filter** (view-only) — click a column's chevron to sort; a filter box
  shows only matching rows. Neither changes the file.
- **Schema from lint rules** — a column with an `enum` rule renders as a
  **dropdown**; cells that violate a rule are outlined.
- **Undo / redo** (ribbon History, or Ctrl/Cmd+Z / Shift+Z) and **fill-down**
  (Ctrl/Cmd+D) over a selected range.
- **Import** a CSV or XLSX file into the table (Data -> Import).
- **Cell types** — per cell choose text, number, checkbox, multiline text, list,
  sub-table, or object (right-click a cell).
- **Linter** — built-in checks plus your own **declarative YAML rules**
  (`required`, `unique`, `type`, `min`/`max`, `enum`, `pattern`, `nonEmpty`) set
  in settings; results show in a panel from the **Lint** button.
- **Export** — **CSV**, **XLSX** (no dependency), **YAML** (a standalone
  `.yaml` dump of the database with its frontmatter), and a
  **self-contained HTML** file that browses the database (with drill-down,
  search, and its own CSV/XLSX/YAML download) offline, from the toolbar. Sub-assemblies are exploded into
  indented child rows (with a `Level` column) so a spreadsheet shows every part
  on its own line instead of a JSON blob in one cell.
- **Create a new database** from the folder context menu (*New YAML database*),
  the command palette, or the ribbon icon.
- **Git-friendly output** — block style, one value per line, stable key order,
  no line wrapping. Editing one cell changes one line in the diff.
- **Theme-native UI** — styled entirely with Obsidian's own CSS variables, so it
  matches light/dark and any community theme.

## Usage

1. Right-click a folder → **New YAML database**, or create a `*.yaml.md` file
   and click it in the file explorer.
2. Edit in **Table**, **Form**, or **Source** mode. Changes save automatically.
3. Commit with git — diffs stay minimal and readable.

`.yaml.md` files are regular Markdown notes to Obsidian, so they show up in the
file explorer and their frontmatter is available to **Bases** and metadata
queries. The plugin renders the YAML body; the default Markdown view is replaced
automatically when such a file is opened.

### Type inference

Cell/field input is coerced conservatively: `true`/`false` → boolean, empty or
`null` → null, canonical numbers → number, everything else stays a string.
Leading-zero values such as `007` are kept as strings so part numbers are not
mangled.

### Settings

- **Default view** — Table / Form / Source. Table automatically falls back to
  Form when a file is not a list of records.
- **New file base name** and **New file template** — used when creating a
  database.

## Limitations

- **Comments and anchors/aliases are not preserved** when a file is edited
  through the structured views. The plugin shows a notice when it opens such a
  file. Use the Source view or an external editor if you need them.
- Files that fail to parse are shown with an error and are **never overwritten**
  until the syntax is valid.

## Development

```bash
npm install      # install dependencies
npm run dev      # watch-build main.js
npm run build    # type-check + production build
npm test         # run model round-trip / shape / coercion tests
```

To try it in a vault, copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/yaml-trees/` and enable the plugin in
**Settings → Community plugins**. Then create or open any `*.yaml.md` file.

## Project layout

```
src/
  main.ts              plugin entry (view + extension + menu + command + ribbon)
  constants.ts         view type, extensions, icons
  settings.ts          settings + settings tab
  model/
    YamlDocument.ts    parse / deterministic serialize
    shape.ts           shape detection + column collection
    coerce.ts          scalar type inference / formatting
  view/
    YamlView.ts        TextFileView host, mode switching
    Renderer.ts        renderer contract
    TableRenderer.ts   spreadsheet editor
    FormRenderer.ts    recursive form / tree editor
    SourceRenderer.ts  raw YAML editor with validation
```

## License

MIT © ondreu
