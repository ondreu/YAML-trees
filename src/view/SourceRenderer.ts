import { debounce } from "obsidian";
import { Renderer } from "./Renderer";
import { parseYamlWithMeta } from "../model/YamlDocument";
import { highlightYaml } from "./yamlHighlight";

// Raw YAML escape hatch: a monospace textarea bound to the full source text
// (frontmatter + body + comments). On valid input the model, frontmatter and
// comment map are all updated; on invalid input an inline error is shown and
// the model is left untouched so the user never loses data mid-edit.
//
// Syntax highlighting is provided by a coloured <pre> layer rendered directly
// behind a transparent textarea. The textarea keeps native editing/caret/
// selection behaviour; the layer just paints colour. Both share identical text
// metrics so they stay pixel-aligned, and scrolling is mirrored.

export class SourceRenderer extends Renderer {
	render(): void {
		this.container.empty();
		const wrapper = this.container.createDiv({ cls: "yt-source" });

		const error = wrapper.createDiv({ cls: "yt-source-error" });
		error.hide();

		const editor = wrapper.createDiv({ cls: "yt-source-editor" });
		const highlight = editor.createEl("pre", { cls: "yt-source-highlight" });
		const code = highlight.createEl("code");

		const textarea = editor.createEl("textarea", {
			cls: "yt-source-input",
		});
		textarea.value = this.host.getSourceText();
		textarea.spellcheck = false;
		textarea.setAttr("wrap", "off");
		textarea.setAttr("autocapitalize", "off");
		textarea.setAttr("autocomplete", "off");

		const paint = () => {
			highlightYaml(code, textarea.value);
		};
		const syncScroll = () => {
			highlight.scrollTop = textarea.scrollTop;
			highlight.scrollLeft = textarea.scrollLeft;
		};
		paint();

		const validate = debounce(
			() => {
				try {
					// Validate that it parses; discard the result — the host will
					// re-parse the same text via setSourceText.
					parseYamlWithMeta(textarea.value);
					error.hide();
					wrapper.removeClass("has-error");
					// Update model + frontmatter + comments without re-rendering
					// (would reset the caret).
					this.host.setSourceText(textarea.value);
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

		textarea.addEventListener("input", () => {
			paint();
			syncScroll();
			validate();
		});
		textarea.addEventListener("scroll", syncScroll);
	}
}
