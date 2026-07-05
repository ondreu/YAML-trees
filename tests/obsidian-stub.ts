// Stub of the `obsidian` module for headless tests. Only the exports the
// renderers reference at import/run time need real behaviour; the rest are
// inert placeholders so bundling succeeds.

export class Menu {
	addItem(): this {
		return this;
	}
	addSeparator(): this {
		return this;
	}
	showAtMouseEvent(): void {}
}

export function setIcon(): void {}

export class Modal {
	app: unknown;
	contentEl = { empty() {}, createEl() { return {}; }, createDiv() { return {}; } };
	constructor(app: unknown) {
		this.app = app;
	}
	open(): void {}
	close(): void {}
}

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T): T {
	return fn;
}

export class Notice {
	constructor(_message?: string, _timeout?: number) {}
}

// Type-only placeholders (erased at runtime, referenced by other modules).
export class TextFileView {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class TFolder {}
export function normalizePath(p: string): string {
	return p;
}
