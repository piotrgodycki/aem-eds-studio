import path from "node:path";

/**
 * Everything the browser sends ends up as an argument to `eds` or `git`. They
 * are spawned without a shell, but an argument starting with `-` would still be
 * read as an option, so each value is checked against what it should look like.
 */

const BLOCK = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)[A-Za-z0-9._/-]+(?<![./])$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
export const AGENTS = ["claude", "cursor", "codex", "ollama", "omlx", "local"] as const;
export type Agent = (typeof AGENTS)[number];

export class InputError extends Error {}

export function blockName(v: unknown): string {
	if (typeof v !== "string" || !BLOCK.test(v) || v.length > 64)
		throw new InputError("The block name must be kebab-case, e.g. hero or product-cards.");
	return v;
}

/** A design is an http(s) link (Figma, Framer, Stitch or any page), or the bundled sample. */
export function design(v: unknown): string {
	if (v === "sample") return v;
	if (typeof v !== "string") throw new InputError("Paste a design link.");
	let url: URL;
	try {
		url = new URL(v.trim());
	} catch {
		throw new InputError("The design must be a link (Figma, Framer, Stitch or any web page).");
	}
	if (url.protocol !== "https:" && url.protocol !== "http:")
		throw new InputError("The design link must start with https://.");
	return url.toString();
}

/** A GitHub token (ghp_, github_pat_, gho_ …): letters, digits and `_`. */
export function githubToken(v: unknown): string {
	const t = typeof v === "string" ? v.trim() : "";
	if (!/^[A-Za-z0-9_]{20,255}$/.test(t))
		throw new InputError("That doesn't look like a GitHub token (ghp_… or github_pat_…).");
	return t;
}

/** A Figma personal access token: letters, digits, `-` and `_` (they start with figd_). */
export function figmaToken(v: unknown): string {
	const t = typeof v === "string" ? v.trim() : "";
	if (!/^[A-Za-z0-9_-]{20,200}$/.test(t))
		throw new InputError("That doesn't look like a Figma token (it starts with figd_).");
	return t;
}

export function repo(v: unknown): string {
	if (typeof v !== "string" || !REPO.test(v))
		throw new InputError("Use owner/name, e.g. acme/site.");
	return v;
}

export function branch(v: unknown): string {
	if (typeof v !== "string" || !BRANCH.test(v) || v.length > 200)
		throw new InputError("That isn't a valid branch name.");
	return v;
}

export function feedback(v: unknown): string {
	if (typeof v !== "string" || !v.trim()) throw new InputError("Say what to change.");
	if (v.length > 4000) throw new InputError("Keep the comment under 4000 characters.");
	return v.trim();
}

export function chatText(v: unknown): string {
	if (typeof v !== "string" || !v.trim()) throw new InputError("Write a message.");
	if (v.length > 20_000) throw new InputError("Keep the message under 20,000 characters.");
	return v.trim();
}

/** A thread id the studio made (a UUID). */
export function id(v: unknown): string {
	if (typeof v !== "string" || !/^[0-9a-f-]{36}$/.test(v))
		throw new InputError("Unknown conversation.");
	return v;
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const TEXT_EXTENSIONS = new Set([
	".txt",
	".md",
	".json",
	".csv",
	".html",
	".css",
	".js",
	".ts",
	".tsx",
	".jsx",
	".yaml",
	".yml",
	".xml",
]);
const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024;

/** Images and text files pasted or dropped into a message: at most five, 10 MB each. */
export function chatFiles(
	v: unknown,
): Array<{ name: string; kind: "image" | "text"; bytes: Buffer }> {
	if (v === undefined || v === null) return [];
	if (!Array.isArray(v) || v.length > 5) throw new InputError("Attach up to five files.");
	return v.map((f) => {
		const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
		const name = typeof o.name === "string" ? path.basename(o.name).slice(-100) : "";
		const ext = path.extname(name).toLowerCase();
		const kind = IMAGE_EXTENSIONS.has(ext) ? "image" : TEXT_EXTENSIONS.has(ext) ? "text" : null;
		if (!kind)
			throw new InputError(
				`${name || "That file"}: attach an image (PNG, JPEG, WebP, GIF, SVG) or a text file.`,
			);
		if (typeof o.data !== "string" || !o.data) throw new InputError(`${name} is empty.`);
		const bytes = Buffer.from(o.data, "base64");
		if (bytes.length > MAX_CHAT_FILE_BYTES) throw new InputError(`${name} is over 10 MB.`);
		return { name, kind, bytes };
	});
}

/** Text quoted from a thread's message: at most five quotes of 4000 characters. */
export function quotes(v: unknown): Array<{ thread: string; text: string }> {
	if (v === undefined || v === null) return [];
	if (!Array.isArray(v) || v.length > 5) throw new InputError("Quote up to five passages.");
	return v.map((q) => {
		const text = (q as { text?: unknown })?.text;
		if (typeof text !== "string" || !text.trim() || text.length > 4000)
			throw new InputError("Keep a quote under 4000 characters.");
		return { thread: id((q as { thread?: unknown }).thread), text: text.trim() };
	});
}

/** Other threads a message refers to: at most three. */
export function threadIds(v: unknown): string[] {
	if (v === undefined || v === null) return [];
	if (!Array.isArray(v) || v.length > 3) throw new InputError("Refer to up to three threads.");
	return v.map(id);
}

/** Pull request numbers dragged into a message: at most five. */
export function pullNumbers(v: unknown): number[] {
	if (v === undefined || v === null) return [];
	if (!Array.isArray(v) || v.length > 5 || !v.every((n) => Number.isInteger(n) && n > 0))
		throw new InputError("Attach up to five pull requests.");
	return v as number[];
}

export function version(v: unknown): number | undefined {
	if (v === undefined || v === null || v === "") return undefined;
	const n = Number(v);
	if (!Number.isInteger(n) || n < 1) throw new InputError("Unknown version.");
	return n;
}

export function agent(v: unknown): Agent | undefined {
	if (v === undefined || v === null || v === "") return undefined;
	if (!AGENTS.includes(v as Agent)) throw new InputError(`Unknown agent "${String(v)}".`);
	return v as Agent;
}

export function model(v: unknown): string | undefined {
	if (v === undefined || v === null || v === "") return undefined;
	if (typeof v !== "string" || !MODEL.test(v) || v.length > 100)
		throw new InputError("That isn't a valid model name.");
	return v;
}

/** An agent the studio can sign in (its own provider's login). */
export function authAgent(v: unknown): string {
	if (typeof v !== "string" || !["claude", "codex"].includes(v))
		throw new InputError("Unknown agent.");
	return v;
}

/** The code from the provider's sign-in page: one line, printable. */
export function authCode(v: unknown): string {
	if (typeof v !== "string" || !v.trim() || v.length > 1000 || !/^[!-~]+$/.test(v.trim()))
		throw new InputError("Paste the code from the sign-in page.");
	return v.trim();
}

export type DesignProvider = "figma" | "framer" | "stitch" | "web";

/** Where a design link points, as `eds block from-design` detects it. */
export function designProvider(link: string): DesignProvider {
	let host = "";
	try {
		host = new URL(link).hostname;
	} catch {
		return "web";
	}
	if (/(^|\.)figma\.com$/.test(host)) return "figma";
	if (/(^|\.)framer\.(com|app|website|ai)$/.test(host)) return "framer";
	if (/(^|\.)stitch\.withgoogle\.com$/.test(host)) return "stitch";
	return "web";
}

const EXPORT_EXTENSIONS = new Set([".png", ".svg", ".jpg", ".jpeg", ".webp"]);
const MAX_EXPORT_BYTES = 15 * 1024 * 1024;

/** A frame exported from Figma (PNG, SVG, JPEG or WebP), sent as base64. */
export function designExport(v: unknown): { extension: string; bytes: Buffer } {
	const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
	const extension = typeof o.name === "string" ? path.extname(o.name).toLowerCase() : "";
	if (!EXPORT_EXTENSIONS.has(extension))
		throw new InputError("Choose a PNG, SVG, JPEG or WebP exported from Figma.");
	if (typeof o.data !== "string" || !o.data) throw new InputError("The exported file is empty.");
	const bytes = Buffer.from(o.data, "base64");
	if (bytes.length > MAX_EXPORT_BYTES)
		throw new InputError("The export is over 15 MB. Export the frame at 1x or as SVG.");
	return { extension, bytes };
}

/** How to read the design, checked against where it points; returns the `eds` flags. */
export function sourceArgs(design: string, raw: unknown, hasFigmaToken: boolean): string[] {
	const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
	const bool = (k: string) => o[k] === true;
	const args: string[] = [];
	if (design !== "sample" && designProvider(design) === "figma") {
		if (o.read !== undefined && o.read !== "rest" && o.read !== "mcp" && o.read !== "export")
			throw new InputError("Read a Figma design through REST, MCP or an export.");
		// An export is read from disk: no API call, so nothing to screenshot or re-fetch.
		if (o.read === "export") return [];
		if (o.read === "rest" && !hasFigmaToken)
			throw new InputError("Figma REST needs a Figma token. Add one, or read through MCP.");
		if (o.read === "mcp") args.push("--mcp");
	} else if (design !== "sample" && bool("signedIn")) {
		args.push("--auth");
	}
	// One more Figma REST or MCP call; none for a scraped page.
	if (design !== "sample" && bool("screenshot")) args.push("--screenshot");
	if (design !== "sample" && bool("refresh")) args.push("--refresh");
	return args;
}
