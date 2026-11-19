import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	acceptedIssue,
	githubBody,
	githubFiles,
	htmlBody,
	issueNotes,
	jiraBody,
	readIssueFiles,
	saveIssueFiles,
} from "../src/server/new-issue.js";
import { InputError, issueFiles, issueFilesId } from "../src/server/validate.js";

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

	it("passes a change on only with the text so far", () => {
		const current = { title: "Tidy hero", body: "## What to do" };
		expect(
			issueNotes({ kind: "task", title: "t", current, change: " Add tablets " }),
		).toMatchObject({
			current,
			change: "Add tablets",
		});
		expect(issueNotes({ kind: "task", title: "t", change: "Add tablets" })).not.toHaveProperty(
			"change",
		);
		expect(issueNotes({ kind: "task", title: "t", current, change: " " })).not.toHaveProperty(
			"current",
		);
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

describe("a new issue's files", () => {
	it("keeps images, PDFs and text, and refuses the rest", () => {
		const data = Buffer.from("x").toString("base64");
		expect(issueFiles([{ name: "spec.pdf", data }])[0].kind).toBe("pdf");
		expect(() => issueFiles([{ name: "tool.exe", data }])).toThrow(InputError);
		expect(() => issueFilesId("../../etc")).toThrow(InputError);
	});

	it("saves them in the project for the agent and reads them back for Create", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "studio-issue-"));
		const data = Buffer.from("png").toString("base64");
		const saved = await saveIssueFiles(root, [
			{ name: "phone.png", data },
			{ name: "phone.png", data },
		]);
		expect(saved?.paths).toEqual([
			`tmp/eds-cli/issues/${saved?.id}/1-phone.png`,
			`tmp/eds-cli/issues/${saved?.id}/2-phone.png`,
		]);
		const files = await readIssueFiles(root, saved?.id ?? "");
		expect(files.map((f) => [f.name, f.type])).toEqual([
			["1-phone.png", "image/png"],
			["2-phone.png", "image/png"],
		]);
		expect(await saveIssueFiles(root, [])).toBeNull();
	});

	it("shows images and links other files under a GitHub issue", () => {
		const md = githubFiles([
			{ name: "1-phone.png", url: "https://x/1.png", type: "image/png" },
			{ name: "2-[spec].pdf", url: "https://x/2.pdf", type: "application/pdf" },
		]);
		expect(md).toContain("## Attachments");
		expect(md).toContain("![1-phone.png](https://x/1.png)");
		expect(md).toContain("- [2-spec.pdf](https://x/2.pdf)");
		expect(githubFiles([])).toBe("");
	});
});
