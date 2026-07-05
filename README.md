# YAML Databases

An [Obsidian](https://obsidian.md) plugin to **view, create and edit YAML files
as interactive databases** — through a clean, native-feeling UI as a
**spreadsheet**, a **form**, or raw **source**.

It was built for maintaining bills of materials (kusovníky) whose changes are
tracked with `git diff`, so its output is **deterministic and diff-friendly**: a
single edit produces a single-line change. It works just as well for any YAML —
inventories, contact lists, changelogs, recipes, configuration, knowledge bases.

## Why YAML inside Markdown (`.yaml.md`)?

Databases are stored as **Markdown files** with a `.yaml.md` suffix
(e.g. `bom.yaml.md`). The file is plain text with two parts:

```
---
title: Drone BOM
owner: ondreu
status: draft
---
- part: Main assembly
  qty: 1
  components:
    - part: M3x8 bolt
      qty: 12
- part: 007 washer
  qty: 24
```

This gives you the best of both worlds:

- **Obsidian treats it as a note.** The leading `---` block is indexed as
  **frontmatter / properties**, so your databases show up in **Bases** and
  metadata queries just like any other note. Tags, links, and Dataview-style
  filters work on database files too.
- **It is a real Markdown file.** It opens in the file explorer, syncs over
  Obsidian Sync, works on mobile, and can be linked to from other notes.
  The plugin replaces only the *view*; the file on disk stays plain text.
- **Human-readable.** Anyone can open it in any editor — VS Code, vim, GitHub,
  Notepad — and read it line by line. No binary format, no database engine.
- **Line-based reading.** Because every value sits on its own line in stable
  order, `git diff` shows exactly what changed: one cell → one line. Reviews
  and merges are trivial.
- **AI-friendly.** The body is clean YAML, a format every LLM reads and writes
  natively. Paste a database into a chat, ask for edits, and paste it back —
  or let an agent commit changes that diff cleanly.
- **Portable.** No lock-in. The file is YAML; the plugin is just a viewer and
  editor. Stop using it tomorrow and your data is still 100% usable.
- **Classic `.yaml` / `.yml` files are also supported** — owned directly via
  extension registration, opened the same way (without the Markdown benefits).

## Features

- **Open `.yaml.md` / `.yaml` / `.yml` files in the main area** by clicking
  them in the file explorer. For `.yaml.md` the plugin intercepts the default
  Markdown view and swaps in its own (only the built-in Markdown view is
  touched, never other plugins' views). If another plugin grabbed the file,
  use the command *Open current file in YAML Databases*.
- **Three switchable views** (toggle in the toolbar):
  - **Table** — a spreadsheet for a list of records (rows × columns). Row
    numbers, sticky header, inline cell and column-name editing, keyboard
    navigation (Tab / Enter / arrows), **resizable columns**,
    **drag-to-reorder** rows and columns, and **Excel-style range selection
    with copy/paste** (TSV). Right-click a row number, column header, or cell
    for insert / move / duplicate / delete / clear and per-cell **type**
    changes.
  - **Form** — a collapsible, labelled tree for maps and nested data, with
    each nested group shown as a clearly separated card.
  - **Source** — the raw YAML with **live syntax highlighting** and validation
    as an escape hatch.
- **Sub-databases (subassemblies)** — a cell can hold a nested list of records;
  **expand** it inline to peek, or **drill in** with a breadcrumb to navigate
  back out. Insert one from the ribbon (Insert → Sub-table). Perfect for BOM
  trees where each assembly contains sub-assemblies.
- **Find & replace** across the whole database and its sub-tables (Data → Find),
  scoped to a column or all, case-sensitive and whole-cell options.
- **Components** (Reuse) — a de-duplicated list of every record across the file
  and its sub-assemblies; insert a copy to reuse a block.
- **Flatten BOM** (Data → Flatten) — roll quantities up through the sub-assembly
  tree into one flat parts list and export it as CSV/XLSX. Sub-assemblies are
  exploded into indented child rows (with a `Level` column) so a spreadsheet
  shows every part on its own line instead of a JSON blob in one cell.
- **Auto-ID** (Data → Auto-ID) — assign nested-friendly hierarchical IDs to
  every part and sub-assembly part (`1`, `1.1`, `1.2.1`…), the id placed first.
- **Metadata** (Data → Metadata) — attach Obsidian-style frontmatter to a
  database, stored as a leading `---` YAML document ahead of the body. A plain
  file with no frontmatter is left untouched.
- **Totals footer** with column sums, a **frozen first column**, and
  **touch-friendly drag** of row numbers / column handles to reorder.
- **Sort & filter** (view-only) — click a column's chevron to sort; a filter
  box shows only matching rows. Neither changes the file.
- **Schema from lint rules** — a column with an `enum` rule renders as a
  **dropdown**; cells that violate a rule are outlined.
- **Undo / redo** (ribbon History, or Ctrl/Cmd+Z / Shift+Z) and **fill-down**
  (Ctrl/Cmd+D) over a selected range.
- **Cell types** — per cell choose text, number, checkbox, multiline text,
  list, sub-table, or object (right-click a cell).
- **Linter** — built-in checks plus your own **declarative YAML rules**
  (`required`, `unique`, `type`, `min`/`max`, `enum`, `pattern`, `nonEmpty`)
  set in settings; results show in a panel from the **Lint** button.
- **Theme-native UI** — styled entirely with Obsidian's own CSS variables, so
  it matches light/dark and any community theme.

### Import

- **CSV** and **XLSX** files (Data → Import). Imported rows are appended to the
  current table, or replace an empty database.

### Export

- **CSV** — standard comma-separated, CRLF, quoted as needed.
- **XLSX** — real Excel file with no runtime dependency (a tiny inline zip +
  worksheet writer, ~2 KB).
- **YAML** — a standalone `.yaml` dump of the database with its frontmatter,
  for sharing with tools that expect plain YAML.
- **HTML** — a self-contained `.html` file that browses the database offline
  (drill-down, search, and its own CSV/XLSX/YAML download buttons). Drop it on
  a USB stick, email it, host it statically — no Obsidian needed.

## Usage

1. Right-click a folder → **New YAML database**, or create a `*.yaml.md` file
   and click it in the file explorer.
2. Edit in **Table**, **Form**, or **Source** mode. Changes save automatically.
3. Commit with git — diffs stay minimal and readable.

`.yaml.md` files are regular Markdown notes to Obsidian, so they show up in the
file explorer and their frontmatter is available to **Bases** and metadata
queries. The plugin renders the YAML body; the default Markdown view is replaced
automatically when such a file is opened.

## Examples

### Bill of materials (BOM) with sub-assemblies

`drone.yaml.md`:

```yaml
---
title: Drone BOM
owner: ondreu
status: draft
---
- part: Airframe
  qty: 1
  supplier: In-house
  inStock: true
  components:
    - part: M3x8 bolt
      qty: 12
    - part: M3 nut
      qty: 12
- part: 007 washer
  qty: 24
  supplier: Bolts Ltd
  inStock: false
- part: PCB v2
  qty: 1
  supplier: JLC
  inStock: true
```

Open it in the Table view, drill into the `components` sub-table of the Airframe
row, run **Flatten** to roll up quantities across the whole tree, then export
the flat parts list to XLSX for purchasing.

### Inventory with lint rules

Settings → Lint rules:

```yaml
rules:
  - column: sku
    required: true
    unique: true
    pattern: "^[A-Z]{3}-\\d{4}$"
  - column: quantity
    type: integer
    min: 0
  - column: status
    enum: [in-stock, ordered, discontinued]
```

Now the `status` column renders as a dropdown, out-of-stock violations are
outlined in red, and the Lint panel lists every problem with row + column.

### Recipe collection

```yaml
---
title: Sourdough
tags: [bread, vegan]
---
- ingredient: Bread flour
  amount: 500
  unit: g
- ingredient: Water
  amount: 350
  unit: g
- ingredient: Salt
  amount: 10
  unit: g
```

### Simple contact list

```yaml
- name: Ada Lovelace
  email: ada@example.com
  role: engineer
- name: Alan Turing
  email: alan@example.com
  role: mathematician
```

## Type inference

Cell/field input is coerced conservatively: `true`/`false` → boolean, empty or
`null` → null, canonical numbers → number, everything else stays a string.
Leading-zero values such as `007` are kept as strings so part numbers are not
mangled.

## Settings

- **Default view** — Table / Form / Source. Table automatically falls back to
  Form when a file is not a list of records.
- **New file base name** and **New file template** — used when creating a
  database.
- **Lint rules** — declarative validation in YAML (see example above).

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
`<vault>/.obsidian/plugins/yaml-databases/` and enable the plugin in
**Settings → Community plugins**. Then create or open any `*.yaml.md` (or
`*.yaml`) file.

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
  export/
    csv.ts  xlsx.ts  html.ts  zip.ts
  import/
    csvRead.ts  xlsxRead.ts
  lint/
    lint.ts
```

## License

MIT © ondreu
