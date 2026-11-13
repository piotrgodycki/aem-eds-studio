import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "../src/web/Markdown.js";

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

describe("agent answers as Markdown", () => {
	it("renders a table, a list and inline code", () => {
		const out = html(
			"Six blocks in `blocks/`.\n\n| Block | Purpose |\n|---|---|\n| **hero** | A banner. |\n| cards | A grid. |\n\n- one\n- two",
		);
		expect(out).toContain("<p>Six blocks in <code>blocks/</code>.</p>");
		expect(out).toContain("<th>Block</th><th>Purpose</th>");
		expect(out).toContain("<td><strong>hero</strong></td><td>A banner.</td>");
		expect(out).toContain("<ul><li>one</li><li>two</li></ul>");
		expect(out).not.toContain("|---|");
	});

	it("keeps code blocks as written and never turns text into HTML", () => {
		const out = html(
			"```js\nconst a = '<b>';\n```\n\n<img src=x onerror=alert(1)> [x](javascript:alert(1))",
		);
		expect(out).toContain("<pre><code>const a = &#x27;&lt;b&gt;&#x27;;</code></pre>");
		expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
		expect(out).not.toContain("<a");
	});

	it("links only to http(s)", () => {
		expect(html("[docs](https://www.aem.live/docs)")).toContain(
			'<a href="https://www.aem.live/docs" target="_blank" rel="noreferrer">docs</a>',
		);
	});
});
