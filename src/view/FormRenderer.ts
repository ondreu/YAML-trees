import { setIcon } from "obsidian";
import { Renderer } from "./Renderer";
import { isPlainObject } from "../model/shape";
import { coerceScalar, formatScalar, isEditableScalar } from "../model/coerce";

// Recursive form/tree editor for arbitrary YAML: maps become labelled fields,
// arrays become numbered items, nested structures become collapsible groups.
// This is the fallback for anything that is not a flat list of records, and the
// default for maps.

export class FormRenderer extends Renderer {
	render(): void {
		this.container.empty();
		const root = this.container.createDiv({ cls: "yt-form" });
		const data = this.host.getData();

		if (isEditableScalar(data)) {
			// A bare scalar document — edit it directly.
			this.renderScalarRow(root, "value", data, (next) => {
				this.host.replaceData(next);
			});
			return;
		}

		this.renderNode(root, data, () => this.host.touch());
	}

	/** Render a container node (object or array) and its children. */
	private renderNode(
		parent: HTMLElement,
		node: unknown,
		onMutate: () => void
	): void {
		if (Array.isArray(node)) {
			this.renderArray(parent, node, onMutate);
		} else if (isPlainObject(node)) {
			this.renderObject(parent, node, onMutate);
		}
	}

	private renderObject(
		parent: HTMLElement,
		obj: Record<string, unknown>,
		onMutate: () => void
	): void {
		for (const key of Object.keys(obj)) {
			this.renderEntry(parent, key, obj[key], obj, onMutate);
		}
		const add = parent.createEl("button", { cls: "yt-btn yt-btn-subtle" });
		setIcon(add.createSpan({ cls: "yt-btn-icon" }), "plus");
		add.createSpan({ text: "Field" });
		add.addEventListener("click", () => {
			const name = window.prompt("New field name");
			if (!name || name in obj) {
				return;
			}
			obj[name] = null;
			this.host.rerender();
		});
	}

	private renderArray(
		parent: HTMLElement,
		arr: unknown[],
		onMutate: () => void
	): void {
		arr.forEach((_, index) => {
			this.renderEntry(parent, String(index), arr[index], arr, onMutate);
		});
		const add = parent.createEl("button", { cls: "yt-btn yt-btn-subtle" });
		setIcon(add.createSpan({ cls: "yt-btn-icon" }), "plus");
		add.createSpan({ text: "Item" });
		add.addEventListener("click", () => {
			arr.push(null);
			this.host.rerender();
		});
	}

	/**
	 * Render a single key/value entry inside an object or array. `holder` is the
	 * parent container (object or array) so edits and deletes can mutate it.
	 */
	private renderEntry(
		parent: HTMLElement,
		key: string,
		value: unknown,
		holder: Record<string, unknown> | unknown[],
		onMutate: () => void
	): void {
		if (isEditableScalar(value)) {
			this.renderScalarRow(parent, key, value, (next) => {
				this.assign(holder, key, next);
				onMutate();
			}, () => this.removeEntry(holder, key));
			return;
		}

		// Nested object/array: collapsible group.
		const group = parent.createDiv({ cls: "yt-group" });
		const header = group.createDiv({ cls: "yt-group-header" });
		const toggle = header.createSpan({ cls: "yt-group-toggle" });
		setIcon(toggle, "chevron-down");
		header.createSpan({ cls: "yt-group-label", text: this.labelFor(key) });
		const kind = Array.isArray(value) ? `${value.length} items` : "group";
		header.createSpan({ cls: "yt-group-kind", text: kind });

		const del = header.createSpan({ cls: "yt-icon-btn" });
		setIcon(del, "trash");
		del.setAttr("aria-label", "Delete");
		del.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.removeEntry(holder, key);
		});

		const body = group.createDiv({ cls: "yt-group-body" });
		this.renderNode(body, value, onMutate);

		header.addEventListener("click", () => {
			const collapsed = group.hasClass("is-collapsed");
			group.toggleClass("is-collapsed", !collapsed);
			setIcon(toggle, collapsed ? "chevron-down" : "chevron-right");
		});
	}

	private renderScalarRow(
		parent: HTMLElement,
		key: string,
		value: unknown,
		onChange: (next: unknown) => void,
		onDelete?: () => void
	): void {
		const row = parent.createDiv({ cls: "yt-field" });
		row.createSpan({ cls: "yt-field-label", text: this.labelFor(key) });

		if (typeof value === "boolean") {
			const checkbox = row.createEl("input", {
				type: "checkbox",
				cls: "yt-field-checkbox",
			});
			checkbox.checked = value;
			checkbox.addEventListener("change", () => onChange(checkbox.checked));
		} else {
			const input = row.createEl("input", {
				type: "text",
				cls: "yt-field-input",
			});
			input.value = formatScalar(value);
			if (value === null || value === undefined) {
				input.placeholder = "—";
			}
			input.addEventListener("change", () => {
				const before = typeof value;
				const next = coerceScalar(input.value);
				onChange(next);
				// If the type changed, re-render so the control matches (e.g. checkbox).
				if (typeof next !== before) {
					this.host.rerender();
				}
			});
		}

		if (onDelete) {
			const del = row.createSpan({ cls: "yt-icon-btn" });
			setIcon(del, "trash");
			del.setAttr("aria-label", "Delete");
			del.addEventListener("click", () => onDelete());
		}
	}

	// --- helpers ----------------------------------------------------------

	private assign(
		holder: Record<string, unknown> | unknown[],
		key: string,
		value: unknown
	): void {
		if (Array.isArray(holder)) {
			holder[Number(key)] = value;
		} else {
			holder[key] = value;
		}
	}

	private removeEntry(
		holder: Record<string, unknown> | unknown[],
		key: string
	): void {
		if (Array.isArray(holder)) {
			holder.splice(Number(key), 1);
		} else {
			delete holder[key];
		}
		this.host.rerender();
	}

	/** Array indices render as "#1"; object keys render as-is. */
	private labelFor(key: string): string {
		return /^\d+$/.test(key) ? `#${Number(key) + 1}` : key;
	}
}
