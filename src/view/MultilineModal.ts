import { App, Modal } from "obsidian";

// Simple modal with a textarea for editing multiline string cells. Works on
// mobile (unlike window.prompt).

export class MultilineModal extends Modal {
	private readonly initial: string;
	private readonly label: string;
	private readonly onSubmit: (value: string) => void;

	constructor(
		app: App,
		label: string,
		initial: string,
		onSubmit: (value: string) => void
	) {
		super(app);
		this.label = label;
		this.initial = initial;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: `Edit ${this.label}` });
		const textarea = contentEl.createEl("textarea", {
			cls: "yt-multiline-textarea",
		});
		textarea.value = this.initial;
		textarea.rows = 10;
		textarea.focus();

		const buttons = contentEl.createDiv({ cls: "yt-modal-buttons" });
		const save = buttons.createEl("button", {
			cls: "mod-cta",
			text: "Save",
		});
		save.addEventListener("click", () => {
			this.onSubmit(textarea.value);
			this.close();
		});
		const cancel = buttons.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
