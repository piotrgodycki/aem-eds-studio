import { describe, expect, it } from "vitest";
import {
	acceptedIssue,
	githubBody,
	htmlBody,
	issueNotes,
	jiraBody,
} from "../src/server/new-issue.js";
import { InputError } from "../src/server/validate.js";

const markdown = [
	"## Goal",
	"Show the **price** on <mobile>",
	"",
	"## Acceptance criteria",
	"- [ ] The price shows below `h1`",
	"- [x] Nothing else moves",
	"",
	"1. Open the page",
].join("\n");

describe("a Manager's new issue", () => {
	it("checks the notes for the agent: feature, bug or task, a title, maybe a block", () => {
		expect(
			issueNotes({ kind: "task", title: "  Tidy \n hero ", details: "x", block: "hero" }),
		).toEqual({
			kind: "task",
			title: "Tidy hero",
			notes: "x",
			block: "hero",
		});
		expect(() => issueNotes({ kind: "epic", title: "x" })).toThrow(InputError);
		expect(() => issueNotes({ kind: "bug", title: " " })).toThrow(InputError);
		expect(() => issueNotes({ kind: "bug", title: "x", block: "--help" })).toThrow(InputError);
	});

	it("opens nothing until the person accepts a written text", () => {
		expect(() => acceptedIssue({ kind: "bug", title: "x", body: " " })).toThrow("Write it first");
		expect(acceptedIssue({ kind: "feature", title: "x", body: "## Goal" }).body).toBe("## Goal");
	});

	it("keeps Markdown for GitHub and converts it for Jira and Azure DevOps", () => {
		expect(githubBody(markdown)).toContain("- [ ] The price shows below `h1`");
		const jira = jiraBody(markdown);
		expect(jira).toContain("h3. Goal");
		expect(jira).toContain("* (x) The price shows below {{h1}}");
		expect(jira).toContain("* (/) Nothing else moves");
		expect(jira).toContain("# Open the page");
		const html = htmlBody(markdown);
		expect(html).toContain("<h3>Goal</h3>");
		expect(html).toContain("<p>Show the <b>price</b> on &lt;mobile&gt;</p>");
		expect(html).toContain("<ul><li>☐ The price shows below <code>h1</code></li>");
		expect(html).toContain("<ol><li>Open the page</li></ol>");
	});
});
