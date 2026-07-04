import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYaml, serializeYaml } from "../src/model/YamlDocument";
import { detectShape, collectColumns } from "../src/model/shape";
import { coerceScalar, formatScalar } from "../src/model/coerce";

test("round-trips a list of records", () => {
	const src = "- name: Bolt\n  quantity: 4\n- name: Nut\n  quantity: 4\n";
	const { value } = parseYaml(src);
	assert.deepEqual(value, [
		{ name: "Bolt", quantity: 4 },
		{ name: "Nut", quantity: 4 },
	]);
	assert.equal(serializeYaml(value), src);
});

test("round-trips a map", () => {
	const src = "title: Assembly\ncount: 2\nactive: true\n";
	const { value } = parseYaml(src);
	assert.deepEqual(value, { title: "Assembly", count: 2, active: true });
	assert.equal(serializeYaml(value), src);
});

test("round-trips a scalar list", () => {
	const src = "- a\n- b\n- c\n";
	const { value } = parseYaml(src);
	assert.deepEqual(value, ["a", "b", "c"]);
	assert.equal(serializeYaml(value), src);
});

test("detectShape classifies the four shapes", () => {
	assert.equal(detectShape([{ a: 1 }, { a: 2 }]), "records");
	assert.equal(detectShape(["a", "b"]), "list");
	assert.equal(detectShape({ a: 1 }), "map");
	assert.equal(detectShape("hello"), "scalar");
	assert.equal(detectShape(42), "scalar");
	assert.equal(detectShape(null), "scalar");
});

test("collectColumns preserves first-seen order across sparse records", () => {
	const records = [
		{ name: "A", qty: 1 },
		{ name: "B", supplier: "X" },
	];
	assert.deepEqual(collectColumns(records), ["name", "qty", "supplier"]);
});

test("editing a single cell touches exactly one line", () => {
	const before = "- name: Bolt\n  quantity: 4\n- name: Nut\n  quantity: 4\n";
	const { value } = parseYaml(before);
	(value as { quantity: number }[])[1].quantity = 8;
	const after = serializeYaml(value);
	const changed = diffLines(before, after);
	assert.equal(changed, 1, `expected 1 changed line, got ${changed}`);
});

test("coerceScalar infers types conservatively", () => {
	assert.equal(coerceScalar("42"), 42);
	assert.equal(coerceScalar("3.14"), 3.14);
	assert.equal(coerceScalar("true"), true);
	assert.equal(coerceScalar("false"), false);
	assert.equal(coerceScalar(""), null);
	assert.equal(coerceScalar("null"), null);
	assert.equal(coerceScalar("hello"), "hello");
	// Not a canonical number -> stays a string.
	assert.equal(coerceScalar("007"), "007");
	assert.equal(coerceScalar("1,000"), "1,000");
});

test("formatScalar renders nested markers and empty values", () => {
	assert.equal(formatScalar(null), "");
	assert.equal(formatScalar(undefined), "");
	assert.equal(formatScalar(5), "5");
	assert.equal(formatScalar([1, 2]), "[2 items]");
	assert.equal(formatScalar({ a: 1 }), "{…}");
});

test("reports comments as a round-trip hazard", () => {
	const { hasComments } = parseYaml("# a comment\nname: X\n");
	assert.equal(hasComments, true);
});

/** Count lines that differ between two texts (ignoring reordering). */
function diffLines(a: string, b: string): number {
	const linesA = a.split("\n");
	const linesB = b.split("\n");
	let changed = 0;
	const max = Math.max(linesA.length, linesB.length);
	for (let i = 0; i < max; i++) {
		if (linesA[i] !== linesB[i]) {
			changed++;
		}
	}
	return changed;
}
