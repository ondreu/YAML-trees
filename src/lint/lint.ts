// Linter for record tables. Rules are declarative and expressed in YAML so a
// user can define their own without writing code. A small set of built-in
// checks always runs; user rules add column constraints on top.

import { parseYamlValue } from "../model/YamlDocument";
import { collectColumns, isPlainObject } from "../model/shape";

export type Severity = "error" | "warning";

export interface Diagnostic {
	severity: Severity;
	message: string;
	/** 0-based row index, when the problem is tied to a specific row. */
	row?: number;
	/** Column the problem relates to, when applicable. */
	column?: string;
}

export interface ColumnRule {
	column: string;
	required?: boolean;
	unique?: boolean;
	type?: "string" | "number" | "integer" | "boolean";
	min?: number;
	max?: number;
	enum?: unknown[];
	pattern?: string;
	severity?: Severity;
}

export interface RuleSet {
	nonEmpty?: boolean;
	rules?: ColumnRule[];
}

export interface ParsedRules {
	ruleSet: RuleSet;
	error: string | null;
}

/** Parse a YAML rule document. An empty string yields an empty rule set. */
export function parseRules(yamlText: string): ParsedRules {
	if (!yamlText.trim()) {
		return { ruleSet: {}, error: null };
	}
	try {
		const value = parseYamlValue(yamlText);
		if (!isPlainObject(value)) {
			return { ruleSet: {}, error: "Rules must be a YAML mapping." };
		}
		const rules = Array.isArray(value.rules)
			? (value.rules as ColumnRule[])
			: [];
		return {
			ruleSet: { nonEmpty: value.nonEmpty === true, rules },
			error: null,
		};
	} catch (e) {
		return { ruleSet: {}, error: e instanceof Error ? e.message : String(e) };
	}
}

function typeMatches(value: unknown, type: ColumnRule["type"]): boolean {
	switch (type) {
		case "string":
			return typeof value === "string";
		case "number":
			return typeof value === "number" && Number.isFinite(value);
		case "integer":
			return typeof value === "number" && Number.isInteger(value);
		case "boolean":
			return typeof value === "boolean";
		default:
			return true;
	}
}

/** Run built-in checks plus the given rules against a list of records. */
export function lintRecords(
	records: Record<string, unknown>[],
	ruleSet: RuleSet
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const columns = collectColumns(records);

	if (ruleSet.nonEmpty && records.length === 0) {
		diagnostics.push({
			severity: "error",
			message: "Database is empty but is required to have at least one row.",
		});
	}

	// Built-in: warn on fully empty rows (all values null/empty).
	records.forEach((record, row) => {
		const allEmpty = columns.every((c) => {
			const v = record[c];
			return v === null || v === undefined || v === "";
		});
		if (allEmpty && columns.length > 0) {
			diagnostics.push({ severity: "warning", message: "Empty row.", row });
		}
	});

	for (const rule of ruleSet.rules ?? []) {
		const severity: Severity = rule.severity ?? "error";
		const seen = new Map<string, number>();

		records.forEach((record, row) => {
			const has = Object.prototype.hasOwnProperty.call(record, rule.column);
			const value = record[rule.column];
			const empty = value === null || value === undefined || value === "";

			if (rule.required && (!has || empty)) {
				diagnostics.push({
					severity,
					message: `Missing required value for "${rule.column}".`,
					row,
					column: rule.column,
				});
				return;
			}
			if (empty) {
				return; // Other checks skip empty cells.
			}
			if (rule.type && !typeMatches(value, rule.type)) {
				diagnostics.push({
					severity,
					message: `"${rule.column}" should be ${rule.type}, got ${JSON.stringify(value)}.`,
					row,
					column: rule.column,
				});
			}
			if (typeof value === "number") {
				if (rule.min !== undefined && value < rule.min) {
					diagnostics.push({
						severity,
						message: `"${rule.column}" (${value}) is below minimum ${rule.min}.`,
						row,
						column: rule.column,
					});
				}
				if (rule.max !== undefined && value > rule.max) {
					diagnostics.push({
						severity,
						message: `"${rule.column}" (${value}) is above maximum ${rule.max}.`,
						row,
						column: rule.column,
					});
				}
			}
			if (rule.enum && !rule.enum.includes(value)) {
				diagnostics.push({
					severity,
					message: `"${rule.column}" value ${JSON.stringify(value)} is not one of the allowed values.`,
					row,
					column: rule.column,
				});
			}
			if (rule.pattern && typeof value === "string") {
				let re: RegExp | null = null;
				try {
					re = new RegExp(rule.pattern);
				} catch {
					re = null;
				}
				if (re && !re.test(value)) {
					diagnostics.push({
						severity,
						message: `"${rule.column}" value "${value}" does not match pattern ${rule.pattern}.`,
						row,
						column: rule.column,
					});
				}
			}
			if (rule.unique) {
				const key = JSON.stringify(value);
				if (seen.has(key)) {
					diagnostics.push({
						severity,
						message: `Duplicate value ${JSON.stringify(value)} in unique column "${rule.column}" (also row ${(seen.get(key) as number) + 1}).`,
						row,
						column: rule.column,
					});
				} else {
					seen.set(key, row);
				}
			}
		});
	}

	return diagnostics;
}
