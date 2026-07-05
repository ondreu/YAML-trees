// Browser stub of the `obsidian` module for the visual demo.

export class Menu {
	addItem(): this {
		return this;
	}
	addSeparator(): this {
		return this;
	}
	showAtMouseEvent(): void {}
}

export class Modal {
	app: unknown;
	contentEl = document.createElement("div");
	constructor(app: unknown) {
		this.app = app;
	}
	open(): void {}
	close(): void {}
}

export function setIcon(el: HTMLElement, _name: string): void {
	// Render a small neutral square so icon slots are not empty in the demo.
	el.innerHTML =
		'<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/></svg>';
}

export function debounce<T extends (...a: unknown[]) => unknown>(fn: T): T {
	return fn;
}

export class Notice {
	constructor(_m?: string, _t?: number) {}
}
