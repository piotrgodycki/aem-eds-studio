/**
 * A Manager's new issue from the Report. The agent writes it from the person's
 * notes (eds issue write), the person edits and accepts the text, and only then
 * is it opened: a GitHub issue in Markdown, a Jira issue in its wiki markup, or
 * an Azure DevOps work item in HTML.
 */

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TicketFile } from "./tracker.js";
import { blockName, InputError, issueFiles } from "./validate.js";

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
		...changeOf(b),
	};
}

/** A change to an issue already written: the text so far and what the person asks. */
function changeOf(b: Record<string, unknown>) {
	const current = b.current as { title?: unknown; body?: unknown } | undefined;
	const change = typeof b.change === "string" ? b.change.trim().slice(0, 2000) : "";
	if (!change || typeof current?.title !== "string" || typeof current.body !== "string") return {};
	return {
		current: { title: current.title.slice(0, 200), body: current.body.slice(0, 20000) },
		change,
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

/** A new issue's files live in the project, where the agent may read them, until Create. */
export const issueFilesDir = (id: string) => path.join("tmp", "eds-cli", "issues", id);

const TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".pdf": "application/pdf",
};
const typeOf = (name: string) => TYPES[path.extname(name).toLowerCase()] ?? "text/plain";

/** Save the files the page sent; their folder's id and their paths for the agent. */
export async function saveIssueFiles(
	projectPath: string,
	raw: unknown,
): Promise<{ id: string; paths: string[] } | null> {
	const files = issueFiles(raw);
	if (!files.length) return null;
	const id = `${Date.now()}-${randomBytes(3).toString("hex")}`;
	const dir = issueFilesDir(id);
	await mkdir(path.join(projectPath, dir), { recursive: true });
	const paths: string[] = [];
	for (const [i, f] of files.entries()) {
		// A number first keeps two files with the same name apart.
		const name = `${i + 1}-${f.name.replace(/[^\w.-]/g, "-")}`;
		await writeFile(path.join(projectPath, dir, name), f.bytes);
		paths.push(path.join(dir, name).split(path.sep).join("/"));
	}
	return { id, paths };
}

/** The saved files of an issue, for Create. */
export async function readIssueFiles(projectPath: string, id: string): Promise<TicketFile[]> {
	const dir = path.join(projectPath, issueFilesDir(id));
	if (!existsSync(dir)) return [];
	const names = (await readdir(dir)).sort();
	return Promise.all(
		names.map(async (name) => ({
			name,
			bytes: await readFile(path.join(dir, name)),
			type: typeOf(name),
		})),
	);
}

/** The files under a GitHub issue's text: images shown, other files linked. */
export function githubFiles(files: Array<{ name: string; url: string; type: string }>): string {
	if (!files.length) return "";
	const line = (f: { name: string; url: string; type: string }) => {
		const label = f.name.replace(/[[\]()]/g, "");
		return f.type.startsWith("image/") ? `![${label}](${f.url})` : `- [${label}](${f.url})`;
	};
	return `\n\n## Attachments\n\n${files.map(line).join("\n")}`;
}
