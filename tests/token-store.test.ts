import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The keychain, as Electron's safeStorage: each decrypt counts as one macOS prompt.
const keychain = vi.hoisted(() => ({ decrypts: 0 }));
vi.mock("electron", () => ({
	safeStorage: {
		isEncryptionAvailable: () => true,
		encryptString: (s: string) => Buffer.from(`enc:${s}`),
		decryptString: (b: Buffer) => {
			keychain.decrypts++;
			return b.toString().replace(/^enc:/, "");
		},
	},
}));

const { keychainTokenStore } = await import("../src/desktop/token-store.js");

describe("keychain token store", () => {
	let home = "";
	beforeEach(async () => {
		home = await mkdtemp(path.join(os.tmpdir(), "studio-keychain-"));
		process.env.AEM_EDS_STUDIO_HOME = home;
		keychain.decrypts = 0;
	});
	afterEach(async () => {
		await rm(home, { recursive: true, force: true });
	});

	it("reads each token from the keychain once, then from memory", async () => {
		await writeFile(path.join(home, "github-token.enc"), "enc:gh-token");
		await writeFile(path.join(home, "figma-token.enc"), "enc:figma-token");
		const github = keychainTokenStore("github");
		const figma = keychainTokenStore("figma");

		const [a, b, c] = await Promise.all([github.read(), figma.read(), github.read()]);
		expect([a, b, c]).toEqual(["gh-token", "figma-token", "gh-token"]);
		await github.read();
		await figma.read();
		expect(keychain.decrypts).toBe(2);
	});

	it("never touches the keychain without a saved token, and forgets one on clear", async () => {
		const github = keychainTokenStore("github");
		expect(await github.read()).toBeNull();
		await github.write("new-token");
		expect(await github.read()).toBe("new-token");
		await github.clear();
		expect(await github.read()).toBeNull();
		expect(keychain.decrypts).toBe(0);
	});
});
