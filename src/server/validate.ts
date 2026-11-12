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

/** How to read the design, checked against where it points; returns the `eds` flags. */
export function sourceArgs(design: string, raw: unknown, hasFigmaToken: boolean): string[] {
	const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
	const bool = (k: string) => o[k] === true;
	const args: string[] = [];
	if (design !== "sample" && designProvider(design) === "figma") {
		if (o.read !== undefined && o.read !== "rest" && o.read !== "mcp")
			throw new InputError("Read a Figma design through REST or MCP.");
		if (o.read === "rest" && !hasFigmaToken)
			throw new InputError("Figma REST needs a Figma token. Add one, or read through MCP.");
		if (o.read === "mcp") args.push("--mcp");
	} else if (design !== "sample" && bool("signedIn")) {
		args.push("--auth");
	}
	// Free from Figma REST or the scraped page (aem-eds-kit 0.4.69+), one MCP call otherwise.
	if (design !== "sample" && bool("screenshot")) args.push("--screenshot");
	if (design !== "sample" && bool("refresh")) args.push("--refresh");
	return args;
}
