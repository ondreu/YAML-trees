import { Menu, setIcon } from "obsidian";
import { Renderer } from "./Renderer";
import { isPlainObject } from "../model/shape";
import { coerceScalar, formatScalar, isEditableScalar } from "../model/coerce";
import { CommentModal } from "./CommentModal";

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
			// A bare scalar document — edit it directly. No container for comments.
			this.renderScalarRow(root, "value", data, null, (next) => {
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
		// Inline "add field" row: a name input plus a button. Avoids window.prompt,
		// which is unreliable on mobile.
		const adder = parent.createDiv({ cls: "yt-field yt-field-adder" });
		const nameInput = adder.createEl("input", {
			type: "text",
			cls: "yt-field-input",
			attr: { placeholder: "New field name", spellcheck: "false" },
		});
		const add = adder.createEl("button", { cls: "yt-btn yt-btn-subtle" });
		setIcon(add.createSpan({ cls: "yt-btn-icon" }), "plus");
		add.createSpan({ text: "Field" });
		const commit = () => {
			const name = nameInput.value.trim();
			if (!name || name in obj) {
				return;
			}
			obj[name] = null;
			this.host.rerender();
		};
		add.addEventListener("click", commit);
		nameInput.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				commit();
			}
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
			this.renderScalarRow(parent, key, value, holder, (next) => {
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
		holder: Record<string, unknown> | unknown[] | null,
		onChange: (next: unknown) => void,
		onDelete?: () => void
	): void {
		const row = parent.createDiv({ cls: "yt-field" });
		row.createSpan({ cls: "yt-field-label", text: this.labelFor(key) });

		// Trailing comment indicator + tooltip (only when a holder exists).
		const comment = holder ? this.host.getComment(holder, key) : undefined;
		if (comment) {
			row.addClass("yt-field-commented");
			row.setAttr("title", `# ${comment}`);
		}

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
				input.placeholder = "null";
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

		// Right-click the row to add/edit/remove a comment (when a holder exists).
		if (holder) {
			row.addEventListener("contextmenu", (evt) => {
				evt.preventDefault();
				const menu = new Menu();
				const existing = this.host.getComment(holder, key) ?? "";
				menu.addItem((i) =>
					i
						.setTitle(existing ? "Edit comment" : "Add comment")
						.setIcon("message-square")
						.onClick(() =>
							new CommentModal(this.host.app, this.labelFor(key), existing, (text) => {
								this.host.setComment(holder, key, text);
							}).open()
						)
				);
				if (existing) {
					menu.addItem((i) =>
						i.setTitle("Remove comment").setIcon("trash").onClick(() =>
							this.host.setComment(holder, key, "")
						)
					);
				}
				menu.showAtMouseEvent(evt);
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
