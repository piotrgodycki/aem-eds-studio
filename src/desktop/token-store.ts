import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeStorage } from "electron";
import type { TokenStore } from "../server/github-auth.js";
import { studioHome } from "../server/paths.js";

/**
 * A token the user gave the studio ("github" from Connect GitHub, "figma" from
 * Settings), encrypted with the system keychain (macOS Keychain, Windows
 * DPAPI, libsecret) and kept in the studio's home.
 *
 * The keychain is touched only when there is a token to read or one to save:
 * on macOS any access asks the user ("wants to use your confidential
 * information"), so the app must not do it at every launch. Reads go one at a
 * time, so the first one unlocks the key for the rest instead of two prompts
 * at once, and a token read once stays in memory.
 */
let keychainTurn: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
	const next = keychainTurn.then(work, work);
	keychainTurn = next.catch(() => {});
	return next;
}

export function keychainTokenStore(name: "github" | "figma"): TokenStore {
	const file = () => path.join(studioHome(), `${name}-token.enc`);
	// The token once read (or being read), shared by every caller.
	let known: Promise<string | null> | undefined;
	return {
		async read() {
			if (known) return known;
			if (!existsSync(file())) return null; // never signed in: no keychain access
			known = oneAtATime(async () => {
				try {
					return safeStorage.decryptString(await readFile(file())) || null;
				} catch {
					return null;
				}
			});
			return known;
		},
		async write(token) {
			if (!safeStorage.isEncryptionAvailable())
				throw new Error("The system keychain isn't available, so the token can't be stored.");
			await mkdir(studioHome(), { recursive: true });
			await writeFile(file(), await oneAtATime(async () => safeStorage.encryptString(token)), {
				mode: 0o600,
			});
			known = Promise.resolve(token);
		},
		async clear() {
			await rm(file(), { force: true });
			known = undefined;
		},
	};
}
