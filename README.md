# YAML Trees

An [Obsidian](https://obsidian.md) plugin to **view, create and edit YAML files**
through a clean, native-feeling UI — as an interactive **table**, a **form**, or
raw **source**.

It was built for maintaining bills of materials (kusovníky) whose changes are
tracked with `git diff`, so its output is **deterministic and diff-friendly**: a
single edit produces a single-line change. It works just as well for any YAML.

## Features

- **Open `.yaml` / `.yml` files in the main area** by clicking them in the file
  explorer — they open in the YAML Trees editor, not as plain text.
- **Three switchable views** (toggle in the view header):
  - **Table** — for a list of records (rows × columns). Inline cell editing,
    add / remove / rename / reorder columns, add / move / delete rows. The
    primary view for BOMs.
  - **Form** — a collapsible, labelled tree for maps and nested data.
  - **Source** — the raw YAML with live syntax validation as an escape hatch.
- **Create a new database** from the folder context menu (*New YAML database*),
  the command palette (*Create new YAML database*), or the ribbon icon.
- **Git-friendly output** — block style, one value per line, stable key order,
  no line wrapping. Editing one cell changes one line in the diff.
- **Theme-native UI** — styled entirely with Obsidian's own CSS variables, so it
  matches light/dark and any community theme.

## Usage

1. Right-click a folder → **New YAML database**, or click any existing `.yaml`
   file in the file explorer.
2. Edit in **Table**, **Form**, or **Source** mode. Changes save automatically.
3. Commit with git — diffs stay minimal and readable.

To see `.yaml`/`.yml` files in the file explorer, enable
**Settings → Files & Links → Detect all file extensions**. (Registering the
extension already lets the plugin open them; this setting makes them visible.)

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
**Settings → Community plugins**.

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
