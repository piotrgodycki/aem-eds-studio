import { readFile } from "node:fs/promises";
import path from "node:path";
import { InputError } from "./validate.js";

/**
 * page_meta for the Overview's editor: the event's name, all its fields as
 * .edsrc.json holds them, and which functions are written. The kit writes and
 * checks them (eds track page); the studio only reads the files to show them.
 */
export interface PageMetaView {
	event: string;
	/** Every field of the event, dotted names nesting (page.path), as the editor shows them. */
	properties: unknown[];
	/** For each function a property names: true once written, false while it is its stub. */
	written: Record<string, boolean>;
}

/** The fields a config written before base:false always pushed, as rows the editor can change. */
const BASE_ROWS = [
	{ name: "page.path", from: "builtin", key: "path" },
	{ name: "page.title", from: "builtin", key: "title" },
	{ name: "page.template", from: "meta", key: "template" },
	{ name: "page.theme", from: "meta", key: "theme" },
	{ name: "page.language", from: "builtin", key: "language" },
	{ name: "page.environment", from: "builtin", key: "environment" },
	{ name: "page.referrer", from: "builtin", key: "referrer" },
];

/** The event's whole shape: a base:true config's base fields and properties, moved under page. */
function fullShape(pageMeta: { base?: boolean; properties?: unknown[] } | undefined): unknown[] {
	const props = Array.isArray(pageMeta?.properties) ? pageMeta.properties : [];
	if (pageMeta?.base === false) return props;
	return [
		...BASE_ROWS,
		...(props as Array<Record<string, unknown>>).map((p) => ({ ...p, name: `page.${p.name}` })),
	];
}

export async function readPageMeta(root: string): Promise<PageMetaView> {
	let pageMeta: { event?: string; base?: boolean; properties?: unknown[] } | undefined;
	try {
		pageMeta = (
			JSON.parse(await readFile(path.join(root, ".edsrc.json"), "utf-8")) as {
				pageMeta?: typeof pageMeta;
			}
		).pageMeta;
	} catch {
		// no config yet: the default shape
	}
	const properties = fullShape(pageMeta);
	const custom = await readFile(path.join(root, "scripts", "page-meta-custom.js"), "utf-8").catch(
		() => "",
	);
	const written: Record<string, boolean> = {};
	for (const p of properties as Array<{ from?: string; key?: string }>) {
		if (p.from !== "function" || typeof p.key !== "string" || !/^[A-Za-z_$][\w$]*$/.test(p.key))
			continue;
		const fn = new RegExp(
			`export\\s+(?:async\\s+)?function\\s+${p.key}\\s*\\(\\)\\s*\\{([^]*?)\\n\\}`,
		).exec(custom);
		written[p.key] = !!fn && fn[1].trim() !== "return undefined;";
	}
	return {
		event: typeof pageMeta?.event === "string" ? pageMeta.event : "page_meta",
		properties,
		written,
	};
}

/** The page event as JSON for `eds track page --set-page-meta`, which checks it in full. */
export function pageMetaArg(properties: unknown, event: unknown): string {
	if (!Array.isArray(properties)) throw new InputError("page_meta's properties are a list.");
	const json = JSON.stringify({
		event: typeof event === "string" && event ? event : "page_meta",
		// The editor always holds the whole event, so nothing is added under page.
		base: false,
		properties,
	});
	if (json.length > 20_000) throw new InputError("That's too many page_meta properties.");
	return json;
}
