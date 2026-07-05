// Cell value types and conversions between them, powering the per-cell type
// menu (text / number / boolean / multiline / list / sub-table / object).

import { isPlainObject } from "./shape";
import { coerceScalar } from "./coerce";

export type CellType =
	| "text"
	| "number"
	| "boolean"
	| "multiline"
	| "list"
	| "subtable"
	| "object";

/** Classify an existing value into a cell type. */
export function cellType(value: unknown): CellType {
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "number") return "number";
	if (typeof value === "string") return value.includes("\n") ? "multiline" : "text";
	if (Array.isArray(value)) {
		return value.length > 0 && value.every(isPlainObject) ? "subtable" : "list";
	}
	if (isPlainObject(value)) return "object";
	return "text";
}

/** True when a value is a nested table (list of records) we can drill into. */
export function isSubtable(value: unknown): value is Record<string, unknown>[] {
	return Array.isArray(value) && value.length > 0 && value.every(isPlainObject);
}

/** Convert a value to the requested cell type, preserving what makes sense. */
export function convertCell(value: unknown, to: CellType): unknown {
	switch (to) {
		case "text": {
			if (value === null || value === undefined) return null;
			if (typeof value === "string") return value.replace(/\n+/g, " ");
			if (typeof value === "object") return JSON.stringify(value);
			return String(value);
		}
		case "multiline":
			return value === null || value === undefined ? "" : String(value);
		case "number": {
			const n = Number(typeof value === "string" ? value.trim() : value);
			return Number.isFinite(n) ? n : 0;
		}
		case "boolean":
			return Boolean(value) && value !== "false";
		case "list": {
			if (Array.isArray(value)) {
				return value.map((v) => (isPlainObject(v) ? JSON.stringify(v) : v));
			}
			if (typeof value === "string" && value.trim() !== "") {
				return value.split(/\r?\n|,/).map((s) => coerceScalar(s.trim()));
			}
			return [];
		}
		case "subtable": {
			if (isSubtable(value)) return value;
			return [];
		}
		case "object":
			return isPlainObject(value) ? value : {};
	}
}

/** Human label for a cell type, used in menus. */
export function cellTypeLabel(type: CellType): string {
	switch (type) {
		case "text":
			return "Text";
		case "number":
			return "Number";
		case "boolean":
			return "Checkbox";
		case "multiline":
			return "Multiline text";
		case "list":
			return "List";
		case "subtable":
			return "Sub-table";
		case "object":
			return "Object";
	}
}
