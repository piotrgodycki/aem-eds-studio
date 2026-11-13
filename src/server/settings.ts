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
	/** The switches in Settings: each is on unless turned off. */
	autoUpdates?: boolean;
	github?: boolean;
	/** Paired devices may reach the studio over the network. Off unless turned on. */
	networkAccess?: boolean;
}

type Switch = "autoUpdates" | "github";
const FLAGS = [
	"tutorialDone",
	"sidebarCollapsed",
	"autoUpdates",
	"github",
	"networkAccess",
] as const;

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
	for (const key of FLAGS) if (typeof p[key] === "boolean") next[key] = p[key];
	await mkdir(studioHome(), { recursive: true });
	const tmp = `${file()}.${process.pid}.tmp`;
	await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`);
	await rename(tmp, file());
	return next;
}

/** Whether a switch in Settings is on (they all start on). */
export async function isOn(name: Switch): Promise<boolean> {
	return (await readSettings())[name] !== false;
}
