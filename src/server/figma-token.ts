import type { TokenStore } from "./github-auth.js";
import { isOn } from "./settings.js";
import { InputError } from "./validate.js";

/**
 * The Figma token from Settings, kept like the GitHub token: in the system
 * keychain (desktop app), never sent to the page. FIGMA_TOKEN from the
 * environment still works, for the browser mode and CI.
 */

let store: TokenStore | null = null;
export function setFigmaTokenStore(s: TokenStore | null) {
	store = s;
}

async function saved(): Promise<string | null> {
	return store ? store.read().catch(() => null) : null;
}

/** The token eds gets: the one saved in Settings, else FIGMA_TOKEN; none when turned off. */
export async function figmaToken(): Promise<string | undefined> {
	if (!(await isOn("figma"))) return undefined;
	return (await saved()) || process.env.FIGMA_TOKEN || undefined;
}

export interface FigmaTokenStatus {
	/** Saved in Settings. */
	saved: boolean;
	/** Set through FIGMA_TOKEN. */
	env: boolean;
	/** Settings can save one (the desktop app has a keychain). */
	canSave: boolean;
}

export async function figmaTokenStatus(): Promise<FigmaTokenStatus> {
	return { saved: !!(await saved()), env: !!process.env.FIGMA_TOKEN, canSave: !!store };
}

export async function saveFigmaToken(token: string): Promise<void> {
	if (!store) throw new InputError("Saving a token needs the desktop app; here, set FIGMA_TOKEN.");
	await store.write(token);
}

export async function clearFigmaToken(): Promise<void> {
	await store?.clear();
}
