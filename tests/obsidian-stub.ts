// Stub of the `obsidian` module for headless tests. Only the exports the
// renderers reference at import/run time need real behaviour; the rest are
// inert placeholders so bundling succeeds.

// A test-visible menu item builder. Captures its title and click handler so
// tests can drive context-menu actions headlessly.
class MenuItem {
	title = "";
	private handler: (() => void) | null = null;
	setTitle(t: string): this {
		this.title = t;
		return this;
	}
	setIcon(): this {
		return this;
	}
	setChecked(): this {
		return this;
	}
	setDisabled(): this {
		return this;
	}
	onClick(fn: () => void): this {
		this.handler = fn;
		return this;
	}
	click(): void {
		this.handler?.();
	}
}

export class Menu {
	items: MenuItem[] = [];
	addItem(cb: (item: MenuItem) => void): this {
		const item = new MenuItem();
		cb(item);
		this.items.push(item);
		return this;
	}
	addSeparator(): this {
		return this;
	}
	showAtMouseEvent(): void {
		// Expose the most recently shown menu for tests.
		(globalThis as Record<string, unknown>).__lastMenu = this.items;
	}
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
