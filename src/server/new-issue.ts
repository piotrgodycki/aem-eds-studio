/**
 * A Manager's new issue from the Report: a feature or a bug, its details, and
 * optionally the block it is about with the pages that block is on, written for
 * a GitHub issue, a Jira issue or an Azure DevOps work item.
 */

import { blockName, InputError } from "./validate.js";

export interface NewIssue {
	kind: "feature" | "bug";
	title: string;
	details: string;
	/** The block it is about, and the pages it is on when they could be read. */
	block?: { name: string; pages: number | null };
}

/** What the page sent, checked: a kind, a one-line title, plain-text details. */
export function newIssue(v: unknown): Omit<NewIssue, "block"> & { block?: string } {
	const b = (v ?? {}) as Record<string, unknown>;
	const kind = b.kind === "bug" ? "bug" : b.kind === "feature" ? "feature" : null;
	if (!kind) throw new InputError("Pick Feature or Bug.");
	const title =
		typeof b.title === "string" ? b.title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
	if (!title) throw new InputError("Give the issue a title.");
	const details = typeof b.details === "string" ? b.details.trim().slice(0, 5000) : "";
	return { kind, title, details, ...(b.block ? { block: blockName(b.block) } : {}) };
}

const blockLine = (b: NewIssue["block"]) =>
	b
		? b.pages === null
			? `${b.name}, its pages couldn't be read`
			: `${b.name}, on ${b.pages} ${b.pages === 1 ? "page" : "pages"}`
		: "";

const FOOTER = "Opened from aem-eds-studio's Report.";

export function markdownBody(n: NewIssue): string {
	return [
		n.details || "_No details given._",
		...(n.block ? ["", `**Block:** \`${blockLine(n.block)}\``] : []),
		"",
		"---",
		`_${FOOTER}_`,
	].join("\n");
}

/** Jira wiki markup, with the characters that would start markup taken out of the user's text. */
export function jiraIssueBody(n: NewIssue): string {
	const plain = (v: string) => v.replace(/[{}[\]|*_]/g, " ");
	return [
		plain(n.details) || "No details given.",
		...(n.block ? ["", `*Block:* {{${plain(blockLine(n.block))}}}`] : []),
		"",
		`_${FOOTER}_`,
	].join("\n");
}

const escapeHtml = (v: string) =>
	v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** HTML for Azure DevOps, with the user's text escaped. */
export function htmlIssueBody(n: NewIssue): string {
	return [
		`<p>${n.details ? escapeHtml(n.details).replace(/\n/g, "<br>") : "No details given."}</p>`,
		...(n.block ? [`<p><b>Block:</b> <code>${escapeHtml(blockLine(n.block))}</code></p>`] : []),
		`<p><i>${FOOTER}</i></p>`,
	].join("");
}
