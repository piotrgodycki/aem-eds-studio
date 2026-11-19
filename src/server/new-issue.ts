/**
 * A Manager's new issue from the Report. The agent writes it from the person's
 * notes (eds issue write), the person edits and accepts the text, and only then
 * is it opened: a GitHub issue in Markdown, a Jira issue in its wiki markup, or
 * an Azure DevOps work item in HTML.
 */

import { blockName, InputError } from "./validate.js";

export type IssueKind = "feature" | "bug" | "task";

/** The tracker's own type for each kind (tracker.ts tries other names where a project lacks one). */
export const TICKET_TYPE = { feature: "Feature", bug: "Bug", task: "Task" } as const;

const kindOf = (v: unknown): IssueKind => {
	const kind = (["feature", "bug", "task"] as const).find((k) => k === v);
	if (!kind) throw new InputError("Pick Feature, Bug or Task.");
	return kind;
};

const titleOf = (v: unknown): string => {
	const title = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 200) : "";
	if (!title) throw new InputError("Give the issue a title.");
	return title;
};

/** The notes the agent writes from: a kind, a title, plain-text notes and maybe a block. */
export function issueNotes(v: unknown) {
	const b = (v ?? {}) as Record<string, unknown>;
	return {
		kind: kindOf(b.kind),
		title: titleOf(b.title),
		notes: typeof b.details === "string" ? b.details.trim().slice(0, 5000) : "",
		...(b.block ? { block: blockName(b.block) } : {}),
	};
}

/** The text the person accepted: a kind, a title and the Markdown body. */
export function acceptedIssue(v: unknown) {
	const b = (v ?? {}) as Record<string, unknown>;
	const body = typeof b.body === "string" ? b.body.trim().slice(0, 20000) : "";
	if (!body) throw new InputError("The issue has no text yet. Write it first.");
	return { kind: kindOf(b.kind), title: titleOf(b.title), body };
}

const FOOTER =
	"Written with aem-eds-studio's agent from the Manager's notes, and accepted by them.";

export const githubBody = (markdown: string) => `${markdown}\n\n---\n_${FOOTER}_`;

/** The Markdown agents write (headings, lists, checklists, bold, code), in Jira's wiki markup. */
export function jiraBody(markdown: string): string {
	const inline = (s: string) =>
		s
			.replace(/[{}[\]|]/g, " ")
			.replace(/`([^`]+)`/g, "{{$1}}")
			.replace(/\*\*([^*]+)\*\*/g, "*$1*");
	const lines = markdown.split("\n").map((line) => {
		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) return `h${Math.min(heading[1].length + 1, 6)}. ${inline(heading[2])}`;
		const check = /^\s*[-*]\s+\[( |x)\]\s+(.*)$/i.exec(line);
		if (check) return `* ${check[1].trim() ? "(/)" : "(x)"} ${inline(check[2])}`;
		const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
		if (bullet) return `* ${inline(bullet[1])}`;
		const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
		if (numbered) return `# ${inline(numbered[1])}`;
		return inline(line);
	});
	return `${lines.join("\n")}\n\n_${FOOTER}_`;
}

const escapeHtml = (v: string) =>
	v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The same Markdown as HTML for Azure DevOps, the person's text escaped first. */
export function htmlBody(markdown: string): string {
	const inline = (s: string) =>
		escapeHtml(s)
			.replace(/`([^`]+)`/g, "<code>$1</code>")
			.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
	const out: string[] = [];
	let list: "ul" | "ol" | null = null;
	const close = () => {
		if (list) out.push(`</${list}>`);
		list = null;
	};
	const item = (kind: "ul" | "ol", html: string) => {
		if (list !== kind) {
			close();
			out.push(`<${kind}>`);
			list = kind;
		}
		out.push(`<li>${html}</li>`);
	};
	for (const line of markdown.split("\n")) {
		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		const check = /^\s*[-*]\s+\[( |x)\]\s+(.*)$/i.exec(line);
		const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
		const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
		if (heading) {
			close();
			out.push(
				`<h${Math.min(heading[1].length + 1, 6)}>${inline(heading[2])}</h${Math.min(heading[1].length + 1, 6)}>`,
			);
		} else if (check) item("ul", `${check[1].trim() ? "☑" : "☐"} ${inline(check[2])}`);
		else if (bullet) item("ul", inline(bullet[1]));
		else if (numbered) item("ol", inline(numbered[1]));
		else if (line.trim()) {
			close();
			out.push(`<p>${inline(line)}</p>`);
		} else close();
	}
	close();
	out.push(`<p><i>${FOOTER}</i></p>`);
	return out.join("");
}
