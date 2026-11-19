import { describe, expect, it } from "vitest";
import { htmlIssueBody, jiraIssueBody, markdownBody, newIssue } from "../src/server/new-issue.js";
import { InputError } from "../src/server/validate.js";

const issue = {
	kind: "feature" as const,
	title: "Price on the hero",
	details: "Show <b>the price</b>\non mobile {code}",
	block: { name: "hero", pages: 42 },
};

describe("a Manager's new issue", () => {
	it("checks what the page sends", () => {
		expect(
			newIssue({ kind: "bug", title: "  Broken \n link ", details: "x", block: "cards" }),
		).toEqual({
			kind: "bug",
			title: "Broken link",
			details: "x",
			block: "cards",
		});
		expect(() => newIssue({ kind: "epic", title: "x" })).toThrow(InputError);
		expect(() => newIssue({ kind: "bug", title: " " })).toThrow(InputError);
		expect(() => newIssue({ kind: "bug", title: "x", block: "--help" })).toThrow(InputError);
	});

	it("writes the block's pages in each tracker's format, the user's text kept as text", () => {
		expect(markdownBody(issue)).toContain("**Block:** `hero, on 42 pages`");
		expect(jiraIssueBody(issue)).toContain("on mobile  code ");
		expect(jiraIssueBody(issue)).toContain("*Block:* {{hero, on 42 pages}}");
		expect(htmlIssueBody(issue)).toContain("Show &lt;b&gt;the price&lt;/b&gt;<br>on mobile");
		expect(htmlIssueBody({ ...issue, block: { name: "hero", pages: null } })).toContain(
			"hero, its pages couldn&#39;t be read".replace("&#39;", "'"),
		);
	});
});
