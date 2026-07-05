import { Menu, setIcon } from "obsidian";
import { Renderer } from "./Renderer";
import { collectColumns, isPlainObject } from "../model/shape";
import { coerceScalar, formatScalar } from "../model/coerce";
import {
	cellType,
	convertCell,
	isSubtable,
	cellTypeLabel,
	type CellType,
} from "../model/cells";
import {
	moveItem,
	reorderColumns,
	rangeToTsv,
	parseClipboardTable,
	applyPaste,
	nextColumnName,
	blankRow,
} from "../model/records";
import { MultilineModal } from "./MultilineModal";

// Spreadsheet editor for a list of records. Supports drill-down into nested
// record lists (sub-databases / subassemblies), per-cell types, resizable and
// draggable columns, draggable rows, and Excel-style range selection with
// TSV copy/paste.

interface Cell {
	r: number;
	c: number;
}

interface DrillStep {
	row: number;
	col: string;
	label: string;
}

function isTableArray(value: unknown): value is Record<string, unknown>[] {
	return Array.isArray(value) && value.every(isPlainObject);
}

export class TableRenderer extends Renderer {
	/** Drill path from the root database into a nested sub-table. */
	private path: DrillStep[] = [];
	/** Column pixel widths by column name (session-persistent). */
	private widths = new Map<string, number>();
	/** Selection anchor and focus (the active cell). */
	private anchor: Cell | null = null;
	private active: Cell | null = null;
	/** Focus to restore after the next render (structural changes). */
	private pendingFocus: Cell | null = null;
	private pendingHeaderFocus: number | null = null;

	private cellEls: HTMLElement[][] = [];
	private scrollEl: HTMLElement | null = null;

	render(): void {
		this.container.empty();
		this.cellEls = [];

		const level = this.resolveLevel();
		this.renderBreadcrumb(level !== null);

		if (level === null) {
			this.renderNotRecords();
			return;
		}

		const records = level;
		const columns = collectColumns(records);

		const scroll = this.container.createDiv({ cls: "yt-sheet-scroll" });
		scroll.tabIndex = 0;
		this.scrollEl = scroll;
		const table = scroll.createEl("table", { cls: "yt-sheet" });

		this.renderHead(table, records, columns);
		this.renderBody(table, records, columns);

		this.wireClipboard(scroll, records, columns);
		this.applyPendingFocus(columns);
		this.paintSelection();
	}

	// --- Drill navigation ------------------------------------------------

	private resolveLevel(): Record<string, unknown>[] | null {
		const root = this.host.getData();
		if (!isTableArray(root)) {
			return null;
		}
		let cur: Record<string, unknown>[] = root;
		const validPath: DrillStep[] = [];
		for (const step of this.path) {
			const rec = cur[step.row];
			const next = rec ? rec[step.col] : undefined;
			if (!isTableArray(next)) {
				break; // Path broke (rows deleted etc.); stop here.
			}
			cur = next;
			validPath.push(step);
		}
		this.path = validPath;
		return cur;
	}

	private renderBreadcrumb(haveTable: boolean): void {
		if (this.path.length === 0 && !haveTable) {
			return;
		}
		const bar = this.container.createDiv({ cls: "yt-breadcrumb" });
		const root = bar.createSpan({ cls: "yt-crumb", text: this.host.baseName() });
		root.addEventListener("click", () => {
			this.path = [];
			this.clearSelection();
			this.host.rerender();
		});
		this.path.forEach((step, i) => {
			bar.createSpan({ cls: "yt-crumb-sep", text: "/" });
			const crumb = bar.createSpan({ cls: "yt-crumb", text: step.label });
			crumb.addEventListener("click", () => {
				this.path = this.path.slice(0, i + 1);
				this.clearSelection();
				this.host.rerender();
			});
		});
	}

	// --- Header ----------------------------------------------------------

	private renderHead(
		table: HTMLTableElement,
		records: Record<string, unknown>[],
		columns: string[]
	): void {
		const thead = table.createEl("thead");
		const tr = thead.createEl("tr");
		tr.createEl("th", { cls: "yt-corner" });

		columns.forEach((column, colIndex) => {
			const th = tr.createEl("th", { cls: "yt-colhead" });
			const width = this.widths.get(column);
			if (width) {
				th.style.width = `${width}px`;
			}

			const grip = th.createSpan({ cls: "yt-col-grip" });
			setIcon(grip, "grip-vertical");
			grip.setAttr("draggable", "true");
			grip.setAttr("aria-label", "Drag to reorder column");
			this.wireColumnDrag(grip, columns, colIndex);

			const label = th.createEl("input", {
				cls: "yt-colhead-input",
				attr: { spellcheck: "false" },
			});
			label.value = column;
			label.addEventListener("blur", () => this.renameColumn(column, label.value));
			label.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter") {
					evt.preventDefault();
					label.blur();
				} else if (evt.key === "Escape") {
					label.value = column;
					label.blur();
				}
			});

			th.addEventListener("contextmenu", (evt) =>
				this.openColumnMenu(evt, column, colIndex, columns)
			);

			const handle = th.createSpan({ cls: "yt-col-resize" });
			this.wireColumnResize(handle, th, column);
		});

		const addTh = tr.createEl("th", { cls: "yt-addcol", text: "+" });
		addTh.setAttr("aria-label", "Add column");
		addTh.addEventListener("click", () => this.addColumn(records, columns));
	}

	// --- Body ------------------------------------------------------------

	private renderBody(
		table: HTMLTableElement,
		records: Record<string, unknown>[],
		columns: string[]
	): void {
		const tbody = table.createEl("tbody");

		records.forEach((record, rowIndex) => {
			this.cellEls[rowIndex] = [];
			const tr = tbody.createEl("tr");

			const gutter = tr.createEl("th", {
				cls: "yt-rownum",
				text: String(rowIndex + 1),
			});
			gutter.setAttr("draggable", "true");
			gutter.setAttr("aria-label", `Row ${rowIndex + 1}`);
			this.wireRowDrag(gutter, records, rowIndex);
			gutter.addEventListener("click", (evt) =>
				this.openRowMenu(evt, records, rowIndex)
			);

			columns.forEach((column, colIndex) => {
				const td = tr.createEl("td", { cls: "yt-cell" });
				this.cellEls[rowIndex][colIndex] = td;
				this.renderCell(td, record, column, rowIndex, colIndex, records);
			});

			tr.createEl("td", { cls: "yt-cell yt-cell-spacer" });
		});

		const footer = tbody.createEl("tr", { cls: "yt-addrow" });
		const cell = footer.createEl("td", {
			cls: "yt-addrow-cell",
			text: "+ Add row",
			attr: { colspan: String(columns.length + 2) },
		});
		cell.addEventListener("click", () => this.addRow(records, columns));
	}

	private renderCell(
		td: HTMLElement,
		record: Record<string, unknown>,
		column: string,
		rowIndex: number,
		colIndex: number,
		records: Record<string, unknown>[]
	): void {
		const value = record[column];
		const type = cellType(value);

		td.addEventListener("mousedown", (evt) => this.onCellMouseDown(evt, rowIndex, colIndex));
		td.addEventListener("contextmenu", (evt) =>
			this.openCellMenu(evt, record, column, rowIndex, colIndex, records)
		);

		if (isSubtable(value)) {
			const drill = td.createEl("button", { cls: "yt-drill" });
			setIcon(drill.createSpan({ cls: "yt-btn-icon" }), "table");
			drill.createSpan({ text: `${value.length} rows` });
			drill.addEventListener("click", () =>
				this.drillInto(rowIndex, column, records)
			);
			return;
		}

		if (type === "object") {
			td.addClass("yt-cell-readonly");
			td.createSpan({ cls: "yt-cell-nested", text: formatScalar(value) });
			return;
		}

		if (type === "list") {
			const input = this.makeCellInput(td, rowIndex, colIndex);
			input.value = (value as unknown[]).map((v) => formatScalar(v)).join(", ");
			input.addClass("yt-cell-list");
			input.addEventListener("change", () => {
				record[column] = input.value
					.split(",")
					.map((s) => coerceScalar(s.trim()))
					.filter((_, i, arr) => !(arr.length === 1 && input.value.trim() === ""));
				this.host.touch();
			});
			return;
		}

		if (type === "multiline") {
			const input = this.makeCellInput(td, rowIndex, colIndex);
			input.value = String(value).replace(/\n/g, " ");
			input.readOnly = true;
			input.addClass("yt-cell-multiline");
			input.addEventListener("dblclick", () =>
				this.editMultiline(record, column, rowIndex, colIndex)
			);
			return;
		}

		if (type === "boolean") {
			const box = td.createEl("input", { type: "checkbox", cls: "yt-cell-checkbox" });
			box.checked = value as boolean;
			box.dataset.row = String(rowIndex);
			box.dataset.col = String(colIndex);
			box.addEventListener("change", () => {
				record[column] = box.checked;
				this.host.touch();
			});
			this.wireCellKeys(box, rowIndex, colIndex);
			return;
		}

		const input = this.makeCellInput(td, rowIndex, colIndex);
		input.value = formatScalar(value);
		input.addEventListener("change", () => {
			record[column] = coerceScalar(input.value);
			this.host.touch();
		});
	}

	private makeCellInput(
		td: HTMLElement,
		rowIndex: number,
		colIndex: number
	): HTMLInputElement {
		const input = td.createEl("input", {
			type: "text",
			cls: "yt-cell-input",
			attr: { spellcheck: "false" },
		});
		input.dataset.row = String(rowIndex);
		input.dataset.col = String(colIndex);
		input.addEventListener("focus", () => this.setActive(rowIndex, colIndex));
		this.wireCellKeys(input, rowIndex, colIndex);
		return input;
	}

	// --- Selection & keyboard -------------------------------------------

	private setActive(r: number, c: number): void {
		this.active = { r, c };
		this.anchor = { r, c };
		this.paintSelection();
	}

	private clearSelection(): void {
		this.active = null;
		this.anchor = null;
	}

	private onCellMouseDown(evt: MouseEvent, r: number, c: number): void {
		if (evt.shiftKey && this.anchor) {
			// Extend the selection without stealing edit focus.
			evt.preventDefault();
			this.active = { r, c };
			this.paintSelection();
		}
	}

	private wireCellKeys(el: HTMLElement, r: number, c: number): void {
		el.addEventListener("keydown", (evt: KeyboardEvent) => {
			switch (evt.key) {
				case "Enter":
					evt.preventDefault();
					this.focusCell(r + (evt.shiftKey ? -1 : 1), c);
					break;
				case "ArrowDown":
					evt.preventDefault();
					this.focusCell(r + 1, c);
					break;
				case "ArrowUp":
					evt.preventDefault();
					this.focusCell(r - 1, c);
					break;
				case "Tab":
					if (!evt.shiftKey) {
						evt.preventDefault();
						this.focusCell(r, c + 1) || this.focusCell(r + 1, 0);
					} else {
						evt.preventDefault();
						this.focusCell(r, c - 1);
					}
					break;
				case "Escape":
					(el as HTMLInputElement).blur?.();
					break;
			}
		});
	}

	private focusCell(r: number, c: number): boolean {
		const target = this.scrollEl?.querySelector<HTMLInputElement>(
			`[data-row="${r}"][data-col="${c}"]`
		);
		if (!target) {
			return false;
		}
		target.focus();
		if (target.type === "text") {
			target.select();
		}
		return true;
	}

	private paintSelection(): void {
		for (const row of this.cellEls) {
			for (const td of row ?? []) {
				td?.removeClass("is-selected", "is-active");
			}
		}
		if (!this.active || !this.anchor) {
			return;
		}
		const r1 = Math.min(this.anchor.r, this.active.r);
		const r2 = Math.max(this.anchor.r, this.active.r);
		const c1 = Math.min(this.anchor.c, this.active.c);
		const c2 = Math.max(this.anchor.c, this.active.c);
		for (let r = r1; r <= r2; r++) {
			for (let c = c1; c <= c2; c++) {
				this.cellEls[r]?.[c]?.addClass("is-selected");
			}
		}
		this.cellEls[this.active.r]?.[this.active.c]?.addClass("is-active");
	}

	// --- Clipboard -------------------------------------------------------

	private wireClipboard(
		scroll: HTMLElement,
		records: Record<string, unknown>[],
		columns: string[]
	): void {
		scroll.addEventListener("copy", (evt: ClipboardEvent) => {
			if (!this.hasRange()) {
				return; // Single cell: let the input copy its own text.
			}
			const tsv = rangeToTsv(
				records,
				columns,
				this.anchor!.r,
				this.anchor!.c,
				this.active!.r,
				this.active!.c
			);
			evt.clipboardData?.setData("text/plain", tsv);
			evt.preventDefault();
		});

		scroll.addEventListener("paste", (evt: ClipboardEvent) => {
			const text = evt.clipboardData?.getData("text/plain") ?? "";
			if (!/[\t\n]/.test(text) || !this.active) {
				return; // Single value: let the focused input handle it.
			}
			evt.preventDefault();
			const block = parseClipboardTable(text);
			applyPaste(records, columns, this.active.r, this.active.c, block);
			this.host.replaceData(this.host.getData());
		});
	}

	private hasRange(): boolean {
		return (
			!!this.anchor &&
			!!this.active &&
			(this.anchor.r !== this.active.r || this.anchor.c !== this.active.c)
		);
	}

	// --- Structural operations ------------------------------------------

	private addRow(records: Record<string, unknown>[], columns: string[]): void {
		records.push(blankRow(columns));
		this.pendingFocus = { r: records.length - 1, c: 0 };
		this.host.replaceData(this.host.getData());
	}

	private addColumn(records: Record<string, unknown>[], columns: string[]): void {
		const name = nextColumnName(columns);
		if (records.length === 0) {
			records.push({ [name]: null });
		} else {
			for (const record of records) {
				if (!(name in record)) record[name] = null;
			}
		}
		this.pendingHeaderFocus = columns.length;
		this.host.replaceData(this.host.getData());
	}

	private renameColumn(from: string, to: string): void {
		const next = to.trim();
		if (!next || next === from) {
			return;
		}
		const records = this.resolveLevel();
		if (!records) return;
		if (collectColumns(records).includes(next)) {
			this.host.rerender();
			return;
		}
		this.widths.set(next, this.widths.get(from) ?? 0);
		for (const record of records) {
			if (!(from in record)) continue;
			const rebuilt: Record<string, unknown> = {};
			for (const key of Object.keys(record)) {
				rebuilt[key === from ? next : key] = record[key];
			}
			for (const key of Object.keys(record)) delete record[key];
			Object.assign(record, rebuilt);
		}
		this.host.replaceData(this.host.getData());
	}

	private deleteColumn(column: string): void {
		const records = this.resolveLevel();
		if (!records) return;
		for (const record of records) delete record[column];
		this.host.replaceData(this.host.getData());
	}

	private moveColumn(columns: string[], from: number, to: number): void {
		if (to < 0 || to >= columns.length) return;
		const order = [...columns];
		moveItem(order, from, to);
		const records = this.resolveLevel();
		if (!records) return;
		reorderColumns(records, order);
		this.pendingHeaderFocus = to;
		this.host.replaceData(this.host.getData());
	}

	private insertColumn(columns: string[], at: number): void {
		const name = nextColumnName(columns);
		const order = [...columns];
		order.splice(at, 0, name);
		const records = this.resolveLevel();
		if (!records) return;
		if (records.length === 0) {
			records.push({ [name]: null });
		} else {
			for (const record of records) {
				const rebuilt: Record<string, unknown> = {};
				for (const key of order) rebuilt[key] = key === name ? null : record[key];
				for (const key of Object.keys(record)) delete record[key];
				Object.assign(record, rebuilt);
			}
		}
		this.pendingHeaderFocus = at;
		this.host.replaceData(this.host.getData());
	}

	private insertRow(records: Record<string, unknown>[], at: number): void {
		records.splice(at, 0, blankRow(collectColumns(records)));
		this.pendingFocus = { r: at, c: 0 };
		this.host.replaceData(this.host.getData());
	}

	private moveRow(records: Record<string, unknown>[], from: number, to: number): void {
		moveItem(records, from, to);
		this.host.replaceData(this.host.getData());
	}

	private drillInto(
		rowIndex: number,
		column: string,
		records: Record<string, unknown>[]
	): void {
		const first = (records[rowIndex] &&
			Object.values(records[rowIndex])[0]) as unknown;
		const label = `${column} of ${formatScalar(first) || `row ${rowIndex + 1}`}`;
		this.path.push({ row: rowIndex, col: column, label });
		this.clearSelection();
		this.host.rerender();
	}

	private editMultiline(
		record: Record<string, unknown>,
		column: string,
		r: number,
		c: number
	): void {
		new MultilineModal(
			this.host.app,
			column,
			String(record[column] ?? ""),
			(value) => {
				record[column] = value;
				this.pendingFocus = { r, c };
				this.host.replaceData(this.host.getData());
			}
		).open();
	}

	private setCellType(
		record: Record<string, unknown>,
		column: string,
		to: CellType
	): void {
		record[column] = convertCell(record[column], to);
		this.host.replaceData(this.host.getData());
	}

	// --- Drag and drop ---------------------------------------------------

	private wireRowDrag(
		gutter: HTMLElement,
		records: Record<string, unknown>[],
		rowIndex: number
	): void {
		gutter.addEventListener("dragstart", (evt) => {
			evt.dataTransfer?.setData("application/x-yt-row", String(rowIndex));
			evt.dataTransfer!.effectAllowed = "move";
		});
		gutter.addEventListener("dragover", (evt) => {
			if (evt.dataTransfer?.types.includes("application/x-yt-row")) {
				evt.preventDefault();
				gutter.addClass("yt-drop-target");
			}
		});
		gutter.addEventListener("dragleave", () => gutter.removeClass("yt-drop-target"));
		gutter.addEventListener("drop", (evt) => {
			gutter.removeClass("yt-drop-target");
			const from = Number(evt.dataTransfer?.getData("application/x-yt-row"));
			if (Number.isInteger(from) && from !== rowIndex) {
				evt.preventDefault();
				this.moveRow(records, from, rowIndex);
			}
		});
	}

	private wireColumnDrag(
		grip: HTMLElement,
		columns: string[],
		colIndex: number
	): void {
		grip.addEventListener("dragstart", (evt) => {
			evt.dataTransfer?.setData("application/x-yt-col", String(colIndex));
			evt.dataTransfer!.effectAllowed = "move";
		});
		const th = grip.closest("th");
		th?.addEventListener("dragover", (evt) => {
			if ((evt as DragEvent).dataTransfer?.types.includes("application/x-yt-col")) {
				evt.preventDefault();
				th.addClass("yt-drop-target");
			}
		});
		th?.addEventListener("dragleave", () => th.removeClass("yt-drop-target"));
		th?.addEventListener("drop", (evt) => {
			th.removeClass("yt-drop-target");
			const from = Number(
				(evt as DragEvent).dataTransfer?.getData("application/x-yt-col")
			);
			if (Number.isInteger(from) && from !== colIndex) {
				evt.preventDefault();
				this.moveColumn(columns, from, colIndex);
			}
		});
	}

	private wireColumnResize(
		handle: HTMLElement,
		th: HTMLElement,
		column: string
	): void {
		handle.addEventListener("mousedown", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			const startX = evt.clientX;
			const startWidth = th.getBoundingClientRect().width;
			const onMove = (move: MouseEvent) => {
				const width = Math.max(48, startWidth + (move.clientX - startX));
				th.style.width = `${width}px`;
				this.widths.set(column, width);
			};
			const onUp = () => {
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		});
	}

	// --- Context menus ---------------------------------------------------

	private openColumnMenu(
		evt: MouseEvent,
		column: string,
		colIndex: number,
		columns: string[]
	): void {
		evt.preventDefault();
		const menu = new Menu();
		menu.addItem((i) =>
			i.setTitle("Insert column left").setIcon("arrow-left").onClick(() =>
				this.insertColumn(columns, colIndex)
			)
		);
		menu.addItem((i) =>
			i.setTitle("Insert column right").setIcon("arrow-right").onClick(() =>
				this.insertColumn(columns, colIndex + 1)
			)
		);
		menu.addItem((i) =>
			i
				.setTitle("Move left")
				.setIcon("chevron-left")
				.setDisabled(colIndex <= 0)
				.onClick(() => this.moveColumn(columns, colIndex, colIndex - 1))
		);
		menu.addItem((i) =>
			i
				.setTitle("Move right")
				.setIcon("chevron-right")
				.setDisabled(colIndex >= columns.length - 1)
				.onClick(() => this.moveColumn(columns, colIndex, colIndex + 1))
		);
		menu.addSeparator();
		menu.addItem((i) =>
			i.setTitle("Delete column").setIcon("trash").onClick(() =>
				this.deleteColumn(column)
			)
		);
		menu.showAtMouseEvent(evt);
	}

	private openRowMenu(
		evt: MouseEvent,
		records: Record<string, unknown>[],
		rowIndex: number
	): void {
		evt.preventDefault();
		const menu = new Menu();
		menu.addItem((i) =>
			i.setTitle("Insert row above").setIcon("arrow-up").onClick(() =>
				this.insertRow(records, rowIndex)
			)
		);
		menu.addItem((i) =>
			i.setTitle("Insert row below").setIcon("arrow-down").onClick(() =>
				this.insertRow(records, rowIndex + 1)
			)
		);
		menu.addItem((i) =>
			i.setTitle("Duplicate row").setIcon("copy").onClick(() => {
				records.splice(rowIndex + 1, 0, structuredClone(records[rowIndex]));
				this.host.replaceData(this.host.getData());
			})
		);
		menu.addItem((i) =>
			i.setTitle("Add sub-table column").setIcon("table").onClick(() =>
				this.addSubtableColumn(records)
			)
		);
		menu.addSeparator();
		menu.addItem((i) =>
			i
				.setTitle("Move up")
				.setIcon("chevron-up")
				.setDisabled(rowIndex <= 0)
				.onClick(() => this.moveRow(records, rowIndex, rowIndex - 1))
		);
		menu.addItem((i) =>
			i
				.setTitle("Move down")
				.setIcon("chevron-down")
				.setDisabled(rowIndex >= records.length - 1)
				.onClick(() => this.moveRow(records, rowIndex, rowIndex + 1))
		);
		menu.addSeparator();
		menu.addItem((i) =>
			i.setTitle("Delete row").setIcon("trash").onClick(() => {
				records.splice(rowIndex, 1);
				this.host.replaceData(this.host.getData());
			})
		);
		menu.showAtMouseEvent(evt);
	}

	private openCellMenu(
		evt: MouseEvent,
		record: Record<string, unknown>,
		column: string,
		rowIndex: number,
		colIndex: number,
		records: Record<string, unknown>[]
	): void {
		evt.preventDefault();
		this.setActive(rowIndex, colIndex);
		const menu = new Menu();

		const current = cellType(record[column]);
		const types: CellType[] = [
			"text",
			"number",
			"boolean",
			"multiline",
			"list",
			"subtable",
			"object",
		];
		for (const type of types) {
			menu.addItem((i) =>
				i
					.setTitle(cellTypeLabel(type))
					.setChecked(current === type)
					.onClick(() => this.setCellType(record, column, type))
			);
		}
		menu.addSeparator();
		menu.addItem((i) =>
			i.setTitle("Clear cell").setIcon("eraser").onClick(() => {
				record[column] = null;
				this.host.replaceData(this.host.getData());
			})
		);
		menu.showAtMouseEvent(evt);
	}

	private addSubtableColumn(records: Record<string, unknown>[]): void {
		const name = nextColumnName(collectColumns(records));
		for (const record of records) {
			record[name] = [];
		}
		this.host.replaceData(this.host.getData());
	}

	// --- Focus restoration ----------------------------------------------

	private applyPendingFocus(columns: string[]): void {
		if (this.pendingHeaderFocus !== null) {
			const heads = this.container.querySelectorAll<HTMLInputElement>(
				".yt-colhead-input"
			);
			const el = heads.item(this.pendingHeaderFocus);
			el?.focus();
			el?.select();
			this.pendingHeaderFocus = null;
			return;
		}
		if (this.pendingFocus) {
			const { r, c } = this.pendingFocus;
			this.pendingFocus = null;
			this.focusCell(r, Math.min(c, Math.max(0, columns.length - 1)));
		}
	}

	// --- Empty / non-records states -------------------------------------

	private renderNotRecords(): void {
		const data = this.host.getData();
		const empty = this.container.createDiv({ cls: "yt-empty" });
		const isEmptyDoc =
			data === undefined ||
			data === null ||
			(Array.isArray(data) && data.length === 0);

		if (isEmptyDoc) {
			empty.createDiv({ cls: "yt-empty-title", text: "Empty database" });
			empty.createDiv({
				cls: "yt-empty-subtitle",
				text: "Add the first row to start a table.",
			});
			const start = empty.createEl("button", { cls: "yt-btn", text: "+ Add row" });
			start.addEventListener("click", () => {
				this.pendingFocus = { r: 0, c: 0 };
				this.host.replaceData([{ "field 1": null }]);
			});
			return;
		}

		empty.createDiv({
			cls: "yt-empty-title",
			text: "This file is not a list of records",
		});
		empty.createDiv({
			cls: "yt-empty-subtitle",
			text: "The table view shows a list of objects. Use the Form or Source view for this file.",
		});
	}
}
