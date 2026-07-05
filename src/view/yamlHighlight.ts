// A tiny, dependency-free YAML syntax highlighter for the Source view. It emits
// HTML that is rendered in a layer *behind* a transparent textarea, so the
// output must reproduce every input character exactly (same length per line) or
// the caret would drift out of alignment. Tokens are wrapped in spans; all
// whitespace is preserved verbatim.

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** Classify a trimmed scalar and wrap the *raw* text (spaces intact) in a span. */
function valueSpan(raw: string): string {
	if (raw === "") return "";
	const t = raw.trim();
	let cls = "string";
	if (/^(true|false|yes|no|on|off)$/i.test(t)) cls = "bool";
	else if (/^(null|~)$/i.test(t)) cls = "null";
	else if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(t)) cls = "number";
	else if (/^".*"$/.test(t) || /^'.*'$/.test(t)) cls = "string";
	return `<span class="yt-yl-${cls}">${esc(raw)}</span>`;
}

/** Split a value region into its scalar and an optional trailing `#` comment. */
function valueWithComment(after: string): string {
	if (after === "") return "";
	// A quoted scalar owns everything up to its closing quote; a comment may
	// follow. Otherwise an inline comment starts at the first ` #`.
	if (/^["']/.test(after)) {
		const m = after.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')(\s+#.*)?$/);
		if (m) {
			return (
				valueSpan(m[1]) +
				(m[2] ? `<span class="yt-yl-comment">${esc(m[2])}</span>` : "")
			);
		}
		return valueSpan(after);
	}
	const ci = after.search(/\s#/);
	if (ci >= 0) {
		return (
			valueSpan(after.slice(0, ci)) +
			`<span class="yt-yl-comment">${esc(after.slice(ci))}</span>`
		);
	}
	return valueSpan(after);
}

function highlightLine(line: string): string {
	const indent = /^\s*/.exec(line)![0];
	let rest = line.slice(indent.length);
	let html = indent;

	// Leading list-item dashes ("- ", or nested "- - ").
	let dashes = "";
	let m: RegExpMatchArray | null;
	while ((m = rest.match(/^(-\s+)/))) {
		dashes += m[1];
		rest = rest.slice(m[1].length);
	}
	if (rest === "-") {
		dashes += "-";
		rest = "";
	}
	if (dashes) html += `<span class="yt-yl-dash">${esc(dashes)}</span>`;

	if (rest === "") return html;
	if (rest.startsWith("#")) {
		return html + `<span class="yt-yl-comment">${esc(rest)}</span>`;
	}
	if (rest === "---" || rest === "...") {
		return html + `<span class="yt-yl-marker">${esc(rest)}</span>`;
	}

	// key: value — the key ends at the first colon followed by space or EOL.
	const km = rest.match(/^(.*?):(?=\s|$)/);
	if (km && !km[1].includes("#")) {
		const key = km[1];
		const after = rest.slice(km[0].length); // leading space(s) + value
		const lead = /^\s*/.exec(after)![0];
		return (
			html +
			`<span class="yt-yl-key">${esc(key)}</span>` +
			`<span class="yt-yl-punc">:</span>` +
			lead +
			valueWithComment(after.slice(lead.length))
		);
	}

	// A bare scalar (e.g. an item in a scalar list, or a plain document).
	return html + valueWithComment(rest);
}

/** Highlight a whole YAML document to HTML (newline-separated lines). */
export function highlightYaml(text: string): string {
	return text.split("\n").map(highlightLine).join("\n");
}
