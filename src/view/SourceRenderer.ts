import { debounce } from "obsidian";
import { Renderer } from "./Renderer";
import { parseYaml, serializeYaml } from "../model/YamlDocument";

// Raw YAML escape hatch: a monospace textarea bound to the serialized model.
// On valid input the model is updated; on invalid input an inline error is shown
// and the model is left untouched so the user never loses data mid-edit.

export class SourceRenderer extends Renderer {
	render(): void {
		this.container.empty();
		const wrapper = this.container.createDiv({ cls: "yt-source" });

		const error = wrapper.createDiv({ cls: "yt-source-error" });
		error.hide();

		const textarea = wrapper.createEl("textarea", {
			cls: "yt-source-input",
		});
		textarea.value = serializeYaml(this.host.getData());
		textarea.spellcheck = false;

		const validate = debounce(
			() => {
				try {
					const { value } = parseYaml(textarea.value);
					error.hide();
					wrapper.removeClass("has-error");
					// Update the model but do NOT re-render (would reset the caret).
					this.host.replaceDataQuiet(value);
				} catch (e) {
					wrapper.addClass("has-error");
					error.setText(
						`YAML error: ${e instanceof Error ? e.message : String(e)}`
					);
					error.show();
				}
			},
			400,
			true
		);

		textarea.addEventListener("input", validate);
	}
}
