import { Menu, setIcon } from "obsidian";
import { Renderer } from "./Renderer";
import { collectColumns, isPlainObject } from "../model/shape";
import { coerceScalar, formatScalar, isEditableScalar } from "../model/coerce";

// Spreadsheet-style editor for a list of records (the primary BOM use case).
// Columns are the ordered union of keys across rows; cells are edited inline.

export class TableRenderer extends Renderer {
	render(): void {
		this.container.empty();
		const data = this.host.getData();

		if (!Array.isArray(data) || (data.length > 0 && !data.every(isPlainObject))) {
			this.renderEmptyState(
				"This file is not a list of records.",
				"Use the Form or Source view, or add a row to start a table."
			);
			this.renderToolbar([], data);
			return;
		}

		const records = data as Record<string, unknown>[];
		const columns = collectColumns(records);

		this.renderToolbar(columns, data);

		if (records.length === 0) {
			this.renderEmptyState(
				"Empty database.",
				"Add a column and a row to get started."
			);
			return;
		}

		const wrapper = this.container.createDiv({ cls: "yt-table-wrapper" });
		const table = wrapper.createEl("table", { cls: "yt-table" });

		// Header row.
		const thead = table.createEl("thead");
		const headRow = thead.createEl("tr");
		headRow.createEl("th", { cls: "yt-row-handle" }); // gutter for row menu
		columns.forEach((column) => {
			const th = headRow.createEl("th", { cls: "yt-th" });
			th.createSpan({ text: column, cls: "yt-th-label" });
			th.addEventListener("contextmenu", (evt) =>
				this.openColumnMenu(evt, column, columns)
			);
		});

		// Body rows.
		const tbody = table.createEl("tbody");
		records.forEach((record, rowIndex) => {
			const tr = tbody.createEl("tr");
			const handle = tr.createEl("td", { cls: "yt-row-handle" });
			setIcon(handle, "grip-vertical");
			handle.setAttr("aria-label", `Row ${rowIndex + 1}`);
			handle.addEventListener("click", (evt) =>
				this.openRowMenu(evt, rowIndex, records)
			);

			columns.forEach((column) => {
				const td = tr.createEl("td", { cls: "yt-td" });
				this.renderCell(td, record, column);
			});
		});
	}

	private renderToolbar(columns: string[], data: unknown): void {
		const toolbar = this.container.createDiv({ cls: "yt-toolbar" });

		const addRow = toolbar.createEl("button", { cls: "yt-btn" });
		setIcon(addRow.createSpan({ cls: "yt-btn-icon" }), "plus");
		addRow.createSpan({ text: "Row" });
		addRow.addEventListener("click", () => this.addRow(columns, data));

		const addCol = toolbar.createEl("button", { cls: "yt-btn" });
		setIcon(addCol.createSpan({ cls: "yt-btn-icon" }), "plus");
		addCol.createSpan({ text: "Column" });
		addCol.addEventListener("click", () => this.addColumn(data));
	}

	private renderCell(
		td: HTMLElement,
		record: Record<string, unknown>,
		column: string
	): void {
		const value = record[column];

		if (!isEditableScalar(value)) {
			// Nested structures aren't editable inline; show a muted marker.
			td.createSpan({ cls: "yt-cell-nested", text: formatScalar(value) });
			return;
		}

		if (typeof value === "boolean") {
			const checkbox = td.createEl("input", {
				type: "checkbox",
				cls: "yt-cell-checkbox",
			});
			checkbox.checked = value;
			checkbox.addEventListener("change", () => {
				record[column] = checkbox.checked;
				this.host.touch();
			});
			return;
		}

		const input = td.createEl("input", {
			type: "text",
			cls: "yt-cell-input",
		});
		input.value = formatScalar(value);
		if (value === null || value === undefined) {
			input.addClass("yt-cell-empty");
			input.placeholder = "—";
		}
		input.addEventListener("change", () => {
			record[column] = coerceScalar(input.value);
			this.host.touch();
			// Re-render only if the coerced type changed the cell control
			// (e.g. "true" -> checkbox). Cheap enough to always refresh on blur.
			this.host.rerender();
		});
	}

	private openColumnMenu(
		evt: MouseEvent,
		column: string,
		columns: string[]
	): void {
		evt.preventDefault();
		const menu = new Menu();
		const index = columns.indexOf(column);

		menu.addItem((item) =>
			item
				.setTitle("Rename column")
				.setIcon("pencil")
				.onClick(() => this.renameColumn(column))
		);
		menu.addItem((item) =>
			item
				.setTitle("Move left")
				.setIcon("arrow-left")
				.setDisabled(index <= 0)
				.onClick(() => this.moveColumn(columns, index, index - 1))
		);
		menu.addItem((item) =>
			item
				.setTitle("Move right")
				.setIcon("arrow-right")
				.setDisabled(index >= columns.length - 1)
				.onClick(() => this.moveColumn(columns, index, index + 1))
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Delete column")
				.setIcon("trash")
				.onClick(() => this.deleteColumn(column))
		);
		menu.showAtMouseEvent(evt);
	}

	private openRowMenu(
		evt: MouseEvent,
		rowIndex: number,
		records: Record<string, unknown>[]
	): void {
		evt.preventDefault();
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("Insert row above")
				.setIcon("arrow-up")
				.onClick(() => this.insertRow(records, rowIndex))
		);
		menu.addItem((item) =>
			item
				.setTitle("Insert row below")
				.setIcon("arrow-down")
				.onClick(() => this.insertRow(records, rowIndex + 1))
		);
		menu.addItem((item) =>
			item
				.setTitle("Duplicate row")
				.setIcon("copy")
				.onClick(() => {
					records.splice(rowIndex + 1, 0, { ...records[rowIndex] });
					this.host.replaceData(records);
				})
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Move up")
				.setIcon("arrow-up")
				.setDisabled(rowIndex <= 0)
				.onClick(() => this.moveRow(records, rowIndex, rowIndex - 1))
		);
		menu.addItem((item) =>
			item
				.setTitle("Move down")
				.setIcon("arrow-down")
				.setDisabled(rowIndex >= records.length - 1)
				.onClick(() => this.moveRow(records, rowIndex, rowIndex + 1))
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Delete row")
				.setIcon("trash")
				.onClick(() => {
					records.splice(rowIndex, 1);
					this.host.replaceData(records);
				})
		);
		menu.showAtMouseEvent(evt);
	}

	// --- Structural operations -------------------------------------------

	private addRow(columns: string[], data: unknown): void {
		const records = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
		const row: Record<string, unknown> = {};
		// Seed the new row with the known columns (null values) so it lines up.
		for (const column of columns) {
			row[column] = null;
		}
		records.push(row);
		this.host.replaceData(records);
	}

	private insertRow(records: Record<string, unknown>[], at: number): void {
		const columns = collectColumns(records);
		const row: Record<string, unknown> = {};
		for (const column of columns) {
			row[column] = null;
		}
		records.splice(at, 0, row);
		this.host.replaceData(records);
	}

	private moveRow(
		records: Record<string, unknown>[],
		from: number,
		to: number
	): void {
		const [moved] = records.splice(from, 1);
		records.splice(to, 0, moved);
		this.host.replaceData(records);
	}

	private addColumn(data: unknown): void {
		const name = window.prompt("New column name");
		if (!name) {
			return;
		}
		const records = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
		if (records.length === 0) {
			records.push({ [name]: null });
		} else {
			for (const record of records) {
				if (!(name in record)) {
					record[name] = null;
				}
			}
		}
		this.host.replaceData(records);
	}

	private renameColumn(column: string): void {
		const next = window.prompt("Rename column", column);
		if (!next || next === column) {
			return;
		}
		const records = this.host.getData() as Record<string, unknown>[];
		for (const record of records) {
			if (column in record) {
				// Rebuild the object to preserve column order at the same slot.
				const rebuilt: Record<string, unknown> = {};
				for (const key of Object.keys(record)) {
					rebuilt[key === column ? next : key] = record[key];
				}
				Object.keys(record).forEach((k) => delete record[k]);
				Object.assign(record, rebuilt);
			}
		}
		this.host.replaceData(records);
	}

	private deleteColumn(column: string): void {
		const records = this.host.getData() as Record<string, unknown>[];
		for (const record of records) {
			delete record[column];
		}
		this.host.replaceData(records);
	}

	private moveColumn(columns: string[], from: number, to: number): void {
		const order = [...columns];
		const [moved] = order.splice(from, 1);
		order.splice(to, 0, moved);
		// Reorder keys in every record to match the new column order.
		const records = this.host.getData() as Record<string, unknown>[];
		for (const record of records) {
			const rebuilt: Record<string, unknown> = {};
			for (const key of order) {
				if (key in record) {
					rebuilt[key] = record[key];
				}
			}
			// Preserve any keys not in the column list (shouldn't happen, but safe).
			for (const key of Object.keys(record)) {
				if (!(key in rebuilt)) {
					rebuilt[key] = record[key];
				}
			}
			Object.keys(record).forEach((k) => delete record[k]);
			Object.assign(record, rebuilt);
		}
		this.host.replaceData(records);
	}

	private renderEmptyState(title: string, subtitle: string): void {
		const empty = this.container.createDiv({ cls: "yt-empty" });
		empty.createDiv({ cls: "yt-empty-title", text: title });
		empty.createDiv({ cls: "yt-empty-subtitle", text: subtitle });
	}
}
