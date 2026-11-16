/**
 * A QA report on one element of a draft: what's wrong, the element's values as
 * the review's Select read them, and its screenshot, as a GitHub issue or a Bug
 * in Jira or Azure DevOps.
 */

import { InputError } from "./validate.js";

/** The values a report carries, in the order the issue lists them. */
const VALUES: Array<[key: string, label: string]> = [
	["size", "Size"],
	["font", "Font"],
	["letterSpacing", "Letter spacing"],
	["color", "Colour"],
	["background", "Background"],
	["margin", "Margin"],
	["padding", "Padding"],
	["radius", "Radius"],
];

export interface QaReport {
	block: string;
	selector: string;
	device: string;
	/** What's wrong, in the reporter's words. */
	text: string;
	values: Record<string, string>;
	/** The draft's aem.page preview, when it has one. */
	preview?: string;
}

/** One line of plain text: nothing that can break out of a table cell or a code span. */
const cell = (v: unknown, max = 80) =>
	typeof v === "string" || typeof v === "number"
		? String(v)
				.replace(/[\r\n|`<>]/g, " ")
				.replace(/\s+/g, " ")
				.trim()
				.slice(0, max)
		: "";

/** A selector for a code span: no backticks or line breaks, but its `>` stays. */
const selectorText = (v: string) =>
	v
		.replace(/[\r\n`|]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 300);

/** The element's values from the page, kept to the known ones and made safe for Markdown. */
export function reportValues(style: unknown): Record<string, string> {
	const s = (style ?? {}) as Record<string, unknown>;
	const out: Record<string, string> = {};
	if (s.width !== undefined && s.height !== undefined)
		out.size = `${cell(s.width, 6)} × ${cell(s.height, 6)}`;
	if (s.font)
		out.font = `${cell(s.font, 40)} ${cell(s.fontSize, 10)} / ${cell(s.lineHeight, 10)} · ${cell(s.fontWeight, 6)}`;
	for (const key of ["letterSpacing", "color", "background", "margin", "padding", "radius"]) {
		const v = cell(s[key]);
		if (v && !(key === "letterSpacing" && v === "normal") && !(key === "radius" && v === "0px"))
			out[key] = v;
	}
	return out;
}

/** The draft's preview, only when it is an aem.page or aem.live address. */
export function previewLink(v: unknown): string | undefined {
	if (typeof v !== "string") return undefined;
	try {
		const u = new URL(v);
		return u.protocol === "https:" && /\.aem\.(page|live)$/.test(u.hostname) ? u.href : undefined;
	} catch {
		return undefined;
	}
}

/** What's wrong, required: a report without it says nothing. */
export function reportText(v: unknown): string {
	const text = typeof v === "string" ? v.trim().slice(0, 2000) : "";
	if (!text) throw new InputError("Say what's wrong with it.");
	return text;
}

export function issueTitle(r: QaReport): string {
	const element = cell(r.selector.split(" > ").at(-1), 40);
	return `QA: ${r.block} ${element} on ${cell(r.device, 40)}: ${cell(r.text, 70)}`;
}

export function issueBody(r: QaReport, screenshot: string): string {
	const rows = VALUES.filter(([k]) => r.values[k]).map(
		([k, label]) => `| ${label} | ${r.values[k]} |`,
	);
	return [
		r.text,
		"",
		`**Block:** \`${cell(r.block)}\` · **Element:** \`${selectorText(r.selector)}\` · **Device:** ${cell(r.device)}`,
		...(r.preview ? [`**Draft:** ${r.preview}`] : []),
		"",
		...(rows.length ? ["| | Value |", "|---|---|", ...rows, ""] : []),
		`![${cell(r.selector.split(" > ").at(-1), 40)} in ${cell(r.block)}](${screenshot})`,
		"",
		"---",
		"_Reported from aem-eds-studio's review (Select)._",
	].join("\n");
}

/** The report in Jira's wiki markup; the screenshot is attached to the issue. */
export function jiraBody(r: QaReport): string {
	const jira = (v: string) => v.replace(/[{}[\]|*_]/g, " ");
	const rows = VALUES.filter(([k]) => r.values[k]).map(
		([k, label]) => `|${label}|${jira(r.values[k])}|`,
	);
	return [
		jira(r.text),
		"",
		`*Block:* {{${jira(cell(r.block))}}} *Element:* {{${jira(selectorText(r.selector))}}} *Device:* ${jira(cell(r.device))}`,
		...(r.preview ? [`*Draft:* ${r.preview}`] : []),
		"",
		...(rows.length ? ["||Value||Setting||", ...rows, ""] : []),
		"_Reported from aem-eds-studio's review (Select). The screenshot is attached._",
	].join("\n");
}

const escapeHtml = (v: string) =>
	v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The report as HTML, for Azure DevOps' repro steps; the screenshot follows it. */
export function htmlBody(r: QaReport): string {
	const rows = VALUES.filter(([k]) => r.values[k])
		.map(([k, label]) => `<tr><td>${label}</td><td>${escapeHtml(r.values[k])}</td></tr>`)
		.join("");
	return [
		`<p>${escapeHtml(r.text).replace(/\n/g, "<br>")}</p>`,
		`<p><b>Block:</b> <code>${escapeHtml(cell(r.block))}</code> <b>Element:</b> <code>${escapeHtml(selectorText(r.selector))}</code> <b>Device:</b> ${escapeHtml(cell(r.device))}</p>`,
		r.preview
			? `<p><b>Draft:</b> <a href="${escapeHtml(r.preview)}">${escapeHtml(r.preview)}</a></p>`
			: "",
		rows ? `<table>${rows}</table>` : "",
		"<p><i>Reported from aem-eds-studio's review (Select).</i></p>",
	].join("");
}
