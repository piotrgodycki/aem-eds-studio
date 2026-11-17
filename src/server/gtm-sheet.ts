/**
 * The GTM container ID as authors keep it: a gtm-id row in a sheet in the
 * content tree (aem-eds-kit 0.4.114+), read from the live site like the page does.
 */

import { InputError } from "./validate.js";

/** A sheet path as `eds inspect` reports it, e.g. /analytics. */
export function sheetPath(v: unknown): string {
	if (typeof v !== "string" || !/^\/[\w./-]{1,200}$/.test(v) || v.includes(".."))
		throw new InputError("A sheet is a path like /analytics.");
	return v;
}

/** The live site of a GitHub repository's default branch. */
export function liveSite(repo: string): string {
	const [owner, name] = repo.toLowerCase().split("/");
	return `https://main--${name}--${owner}.aem.live`;
}

export interface GtmSheet {
	/** The published sheet, to open. */
	url: string;
	/** Its gtm-id, or null when the sheet has none or can't be read. */
	id: string | null;
	error?: string;
}

/** The sheet's gtm-id row, from its Key and Value columns. */
export async function readGtmSheet(
	repo: string,
	sheet: string,
	f: typeof fetch = fetch,
): Promise<GtmSheet> {
	const url = `${liveSite(repo)}${sheet}.json`;
	try {
		const res = await f(url, { signal: AbortSignal.timeout(8000) });
		if (!res.ok) return { url, id: null, error: `The sheet isn't published (${res.status}).` };
		const { data = [] } = (await res.json()) as { data?: Array<Record<string, unknown>> };
		const row = data.find((r) => String(r.Key ?? r.key ?? "").trim() === "gtm-id");
		const id = row ? String(row.Value ?? row.value ?? "").trim() : "";
		if (!id) return { url, id: null, error: "The sheet has no gtm-id row, so GTM doesn't load." };
		return { url, id: id.slice(0, 20) };
	} catch {
		return { url, id: null, error: "The sheet couldn't be read." };
	}
}
