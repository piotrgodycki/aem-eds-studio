import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { studioHome } from "./paths.js";

/**
 * App-wide settings, kept in the studio's home rather than the page's storage:
 * the desktop app's page gets a new port (and so a new origin) on every launch.
 */
export interface Settings {
	/** The first-run tutorial was finished or skipped. */
	tutorialDone?: boolean;
	/** The side menu folded to icons. */
	sidebarCollapsed?: boolean;
}

const file = () => path.join(studioHome(), "settings.json");

export async function readSettings(): Promise<Settings> {
	if (!existsSync(file())) return {};
	try {
		return JSON.parse(await readFile(file(), "utf-8")) as Settings;
	} catch {
		return {};
	}
}

export async function updateSettings(patch: unknown): Promise<Settings> {
	const next = { ...(await readSettings()) };
	const p = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
	if (typeof p.tutorialDone === "boolean") next.tutorialDone = p.tutorialDone;
	if (typeof p.sidebarCollapsed === "boolean") next.sidebarCollapsed = p.sidebarCollapsed;
	await mkdir(studioHome(), { recursive: true });
	const tmp = `${file()}.${process.pid}.tmp`;
	await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`);
	await rename(tmp, file());
	return next;
}
