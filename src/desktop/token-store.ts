import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeStorage } from "electron";
import type { TokenStore } from "../server/github-auth.js";
import { studioHome } from "../server/paths.js";

/**
 * The GitHub token from "Connect GitHub", encrypted with the system keychain
 * (macOS Keychain, Windows DPAPI, libsecret) and kept in the studio's home.
 *
 * The keychain is touched only when there is a token to read or one to save:
 * on macOS any access asks the user ("wants to use your confidential
 * information"), so the app must not do it at every launch.
 */
export function keychainTokenStore(): TokenStore {
	const file = () => path.join(studioHome(), "github-token.enc");
	return {
		async read() {
			if (!existsSync(file())) return null; // never signed in: no keychain access
			try {
				return safeStorage.decryptString(await readFile(file())) || null;
			} catch {
				return null;
			}
		},
		async write(token) {
			if (!safeStorage.isEncryptionAvailable())
				throw new Error("The system keychain isn't available, so the token can't be stored.");
			await mkdir(studioHome(), { recursive: true });
			await writeFile(file(), safeStorage.encryptString(token), { mode: 0o600 });
		},
		async clear() {
			await rm(file(), { force: true });
		},
	};
}
