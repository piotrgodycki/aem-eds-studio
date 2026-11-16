import { readFile } from "node:fs/promises";
import path from "node:path";
import { InputError } from "./validate.js";

/**
 * page_meta for the Overview's editor: the properties in .edsrc.json and which
 * functions are written. The kit writes and checks them (eds track page); the
 * studio only reads the files to show them.
 */
export interface PageMetaView {
	properties: unknown[];
	/** For each function a property names: true once written, false while it is its stub. */
	written: Record<string, boolean>;
}

export async function readPageMeta(root: string): Promise<PageMetaView> {
	let properties: unknown[] = [];
	try {
		const config = JSON.parse(await readFile(path.join(root, ".edsrc.json"), "utf-8")) as {
			pageMeta?: { properties?: unknown[] };
		};
		properties = Array.isArray(config.pageMeta?.properties) ? config.pageMeta.properties : [];
	} catch {
		// no config yet: no properties
	}
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
	return { properties, written };
}

/** The properties as JSON for `eds track page --set-page-meta`, which checks them in full. */
export function pageMetaArg(v: unknown): string {
	if (!Array.isArray(v)) throw new InputError("page_meta's properties are a list.");
	const json = JSON.stringify({ properties: v });
	if (json.length > 20_000) throw new InputError("That's too many page_meta properties.");
	return json;
}
