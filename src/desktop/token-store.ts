import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeStorage } from "electron";
import type { TokenStore } from "../server/github-auth.js";
import { studioHome } from "../server/paths.js";

/**
 * The GitHub token from "Connect GitHub", encrypted with the system keychain
 * (macOS Keychain, Windows DPAPI, libsecret) and kept in the studio's home.
 * Without OS encryption there is no store, and sign-in stays off.
 */
export function keychainTokenStore(): TokenStore | null {
	if (!safeStorage.isEncryptionAvailable()) return null;
	const file = () => path.join(studioHome(), "github-token.enc");
	return {
		async read() {
			try {
				return safeStorage.decryptString(await readFile(file())) || null;
			} catch {
				return null;
			}
		},
		async write(token) {
			await mkdir(studioHome(), { recursive: true });
			await writeFile(file(), safeStorage.encryptString(token), { mode: 0o600 });
		},
		async clear() {
			await rm(file(), { force: true });
		},
	};
}
