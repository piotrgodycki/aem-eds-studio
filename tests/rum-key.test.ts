import { afterEach, describe, expect, it } from "vitest";
import type { TokenStore } from "../src/server/github-auth.js";
import {
	clearRumKey,
	rumKey,
	rumKeyStatus,
	saveRumKey,
	setRumKeyStores,
} from "../src/server/rum-key.js";
import { InputError, rumDomain } from "../src/server/validate.js";

/** An in-memory keychain: one secret per name, as the desktop app keeps them. */
function memoryStores() {
	const secrets = new Map<string, string>();
	return (name: string): TokenStore => ({
		read: async () => secrets.get(name) ?? null,
		write: async (t) => {
			secrets.set(name, t);
		},
		clear: async () => {
			secrets.delete(name);
		},
	});
}

afterEach(() => {
	setRumKeyStores(null);
	delete process.env.EDS_RUM_DOMAINKEY;
});

describe("a site's RUM domain key", () => {
	it("is kept per project, and cleared", async () => {
		setRumKeyStores(memoryStores());
		await saveRumKey("p1", "  abc-123-def-456  ");
		expect(await rumKey("p1")).toBe("abc-123-def-456");
		expect(await rumKey("p2")).toBeUndefined();
		expect(await rumKeyStatus("p1")).toMatchObject({ saved: true, canSave: true });
		await clearRumKey("p1");
		expect(await rumKey("p1")).toBeUndefined();
	});

	it("comes from EDS_RUM_DOMAINKEY without a keychain, and can't be saved there", async () => {
		process.env.EDS_RUM_DOMAINKEY = "from-the-environment";
		expect(await rumKey("p1")).toBe("from-the-environment");
		expect(await rumKeyStatus("p1")).toMatchObject({ saved: false, env: true, canSave: false });
		await expect(saveRumKey("p1", "abc-123-def")).rejects.toThrow(InputError);
	});

	it("refuses what doesn't look like a key", async () => {
		setRumKeyStores(memoryStores());
		for (const bad of ["", "short", "has spaces in it", 42])
			await expect(saveRumKey("p1", bad)).rejects.toThrow(InputError);
	});
});

describe("the site's domain", () => {
	it("keeps the host of whatever is pasted", () => {
		expect(rumDomain("https://www.Example.com/offers?x=1")).toBe("www.example.com");
		expect(rumDomain("")).toBeUndefined();
		expect(() => rumDomain("not a domain")).toThrow(InputError);
	});
});
