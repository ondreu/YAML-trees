import { App } from "obsidian";
import type { CommentMap } from "../model/YamlDocument";
import type { RuleSet } from "../lint/lint";

// Contract between the view and its interchangeable renderers (table / form /
// source). The view owns the model; renderers read it through `getData` and
// report changes through either `replaceData` (structural change → re-render +
// save) or `touch` (a value was mutated in place → save only).

export interface EditorHost {
	readonly app: App;
	/** Base name of the file being edited (for breadcrumbs / export names). */
	baseName(): string;
	/** Parsed column rules (schema) used for enum dropdowns and validation. */
	ruleSet(): RuleSet;
	/** Current model value. */
	getData(): unknown;
	/** Replace the whole model, persist, and re-render the active renderer. */
	replaceData(value: unknown): void;
	/** Replace the whole model and persist WITHOUT re-rendering (source mode). */
	replaceDataQuiet(value: unknown): void;
	/** The model was mutated in place; persist without re-rendering. */
	touch(): void;
	/** Force a re-render of the active renderer. */
	rerender(): void;
	/** Per-cell comment map (may be null when the file has no comments). */
	comments(): CommentMap | null;
	/** Get a cell's trailing comment, or undefined if none. */
	getComment(container: object, key: string): string | undefined;
	/** Set or replace a cell's trailing comment (empty string removes it). */
	setComment(container: object, key: string, text: string): void;
	/** Full source text (frontmatter + body + comments) for the Source view. */
	getSourceText(): string;
	/** Re-parse edited source text and update model/frontmatter/comments. */
	setSourceText(text: string): void;
}

export abstract class Renderer {
	protected readonly container: HTMLElement;
	protected readonly host: EditorHost;

	constructor(container: HTMLElement, host: EditorHost) {
		this.container = container;
		this.host = host;
	}

	/** Draw the current model into the container. Called on every refresh. */
	abstract render(): void;
}
