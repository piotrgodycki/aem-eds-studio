import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { InputError } from "./validate.js";

/** Where authors edit a site's pages: Document Authoring (da.live) or the Universal Editor. */
export type ContentSource = "da" | "ue";
export interface ContentLink {
	source: ContentSource;
	url: string;
}

/** What the repository says about its content, and the link to open it. */
export interface ContentInfo {
	/** The link saved in Project settings, else one worked out from the repository. */
	link: ContentLink | null;
	saved: boolean;
	/** What the repository's own files point to: da, ue, another source, or nothing yet. */
	detected: ContentSource | "other" | null;
	/** Set when the saved link's kind doesn't match the repository. */
	warning?: string;
}

const NAMES: Record<ContentSource, string> = {
	da: "Document Authoring",
	ue: "the Universal Editor",
};

/** A link the studio accepts: https, on da.live for DA, on Adobe's editor or an AEM author for UE. */
export function contentLink(v: unknown): ContentLink | undefined {
	if (v === undefined || v === null || v === "") return undefined;
	const { source, url } = (v ?? {}) as Record<string, unknown>;
	if (source !== "da" && source !== "ue")
		throw new InputError("Pick Document Authoring or the Universal Editor.");
	let u: URL;
	try {
		u = new URL(String(url ?? "").trim());
	} catch {
		throw new InputError("The content link is a full address, starting with https://.");
	}
	if (u.protocol !== "https:") throw new InputError("The content link starts with https://.");
	const host = u.hostname;
	if (source === "da" && host !== "da.live")
		throw new InputError(
			"A Document Authoring link is on da.live, e.g. https://da.live/edit#/owner/site.",
		);
	if (source === "ue" && host !== "experience.adobe.com" && !host.endsWith(".adobeaemcloud.com"))
		throw new InputError(
			"A Universal Editor link is on experience.adobe.com or your AEM author (…adobeaemcloud.com).",
		);
	return { source, url: u.href };
}

/** The first mountpoint in fstab.yaml, if the project has one. */
async function mountpoint(root: string): Promise<string | null> {
	try {
		const fstab = await readFile(path.join(root, "fstab.yaml"), "utf-8");
		return fstab.match(/^\s*\/[^:]*:\s*(?:url:\s*)?["']?(https?:\/\/[^\s"']+)/m)?.[1] ?? null;
	} catch {
		return null;
	}
}

/**
 * The kind of content the repository's files point to: component models mean the
 * Universal Editor, a content.da.live mountpoint (or no fstab at all, as a new DA
 * site starts) means Document Authoring, any other mountpoint another source.
 */
async function detect(
	root: string,
): Promise<{ kind: ContentInfo["detected"]; mount: string | null }> {
	const mount = await mountpoint(root);
	if (
		["component-definition.json", "component-models.json"].some((f) =>
			existsSync(path.join(root, f)),
		)
	)
		return { kind: "ue", mount };
	if (!mount) return { kind: existsSync(path.join(root, "fstab.yaml")) ? null : "da", mount };
	if (/content\.da\.live|\/\/da\.live/.test(mount)) return { kind: "da", mount };
	if (/adobeaemcloud\.com/.test(mount)) return { kind: "ue", mount };
	return { kind: "other", mount };
}

/** The DA editor for a site: from its content.da.live mountpoint, else from its GitHub repository. */
function daLink(mount: string | null, repo: string | null): string | null {
	const m = mount?.match(/content\.da\.live\/([\w.-]+)\/([\w.-]+)/);
	if (m) return `https://da.live/edit#/${m[1]}/${m[2]}`;
	return repo ? `https://da.live/edit#/${repo}` : null;
}

export async function contentInfo(
	root: string,
	saved: ContentLink | undefined,
	repo: string | null,
): Promise<ContentInfo> {
	const { kind, mount } = await detect(root);
	if (saved) {
		const mismatch = (kind === "da" || kind === "ue") && kind !== saved.source;
		return {
			link: saved,
			saved: true,
			detected: kind,
			...(mismatch
				? {
						warning: `This repository looks like ${NAMES[kind as ContentSource]}, not ${NAMES[saved.source]}. Check the link.`,
					}
				: {}),
		};
	}
	// The Universal Editor's address can't be worked out from the repository: it is pasted.
	const url = kind === "da" ? daLink(mount, repo) : null;
	return { link: url ? { source: "da", url } : null, saved: false, detected: kind };
}
