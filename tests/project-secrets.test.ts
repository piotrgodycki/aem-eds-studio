import { afterEach, describe, expect, it } from "vitest";
import type { TokenStore } from "../src/server/github-auth.js";
import { daToken, rumKey, setProjectSecretStores } from "../src/server/project-secrets.js";
import {
	contentChange,
	contentFile,
	InputError,
	pagePath,
	rumDomain,
} from "../src/server/validate.js";

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
	setProjectSecretStores(null);
	delete process.env.EDS_RUM_DOMAINKEY;
	delete process.env.DA_TOKEN;
});

describe("a site's RUM domain key", () => {
	it("is kept per project, and cleared", async () => {
		setProjectSecretStores(memoryStores());
		await rumKey.save("p1", "  abc-123-def-456  ");
		expect(await rumKey.get("p1")).toBe("abc-123-def-456");
		expect(await rumKey.get("p2")).toBeUndefined();
		expect(await rumKey.status("p1")).toMatchObject({ saved: true, canSave: true });
		await rumKey.clear("p1");
		expect(await rumKey.get("p1")).toBeUndefined();
	});

	it("comes from EDS_RUM_DOMAINKEY without a keychain, and can't be saved there", async () => {
		process.env.EDS_RUM_DOMAINKEY = "from-the-environment";
		expect(await rumKey.get("p1")).toBe("from-the-environment");
		expect(await rumKey.status("p1")).toMatchObject({ saved: false, env: true, canSave: false });
		await expect(rumKey.save("p1", "abc-123-def")).rejects.toThrow(InputError);
	});

	it("refuses what doesn't look like a key", async () => {
		setProjectSecretStores(memoryStores());
		for (const bad of ["", "short", "has spaces in it", 42])
			await expect(rumKey.save("p1", bad)).rejects.toThrow(InputError);
	});
});

describe("a project's DA token", () => {
	it("is kept apart from the RUM key, per project", async () => {
		setProjectSecretStores(memoryStores());
		const token = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJl";
		await daToken.save("p1", token);
		await rumKey.save("p1", "abc-123-def-456");
		expect(await daToken.get("p1")).toBe(token);
		expect(await rumKey.get("p1")).toBe("abc-123-def-456");
		await daToken.clear("p1");
		expect(await daToken.get("p1")).toBeUndefined();
		expect(await rumKey.get("p1")).toBe("abc-123-def-456");
	});

	it("comes from DA_TOKEN without a keychain, and refuses what isn't a token", async () => {
		process.env.DA_TOKEN = "from-the-environment";
		expect(await daToken.get("p1")).toBe("from-the-environment");
		expect(await daToken.status("p1")).toMatchObject({ env: true, canSave: false });
		setProjectSecretStores(memoryStores());
		for (const bad of ["short", "has spaces in it but is long enough", 42])
			await expect(daToken.save("p1", bad)).rejects.toThrow(InputError);
	});
});

describe("a page change from the chat", () => {
	it("takes a page path on the site, never a URL or a way out", () => {
		expect(pagePath("/products/shoes")).toBe("/products/shoes");
		for (const bad of ["products", "https://example.com/", "/a/../b", "/a b", 1])
			expect(() => pagePath(bad)).toThrow(InputError);
	});

	it("takes only a changed page eds kept in tmp/eds-cli/content/", () => {
		expect(contentFile("tmp/eds-cli/content/index-1700000000.html")).toBe(
			"tmp/eds-cli/content/index-1700000000.html",
		);
		for (const bad of ["/etc/passwd", "tmp/eds-cli/content/../x.html", "tmp/eds-cli/other/a.html"])
			expect(() => contentFile(bad)).toThrow(InputError);
	});

	it("needs words saying what to change", () => {
		expect(contentChange("  Shorter hero title  ")).toBe("Shorter hero title");
		expect(() => contentChange("   ")).toThrow(InputError);
	});
});

describe("the site's domain", () => {
	it("keeps the host of whatever is pasted", () => {
		expect(rumDomain("https://www.Example.com/offers?x=1")).toBe("www.example.com");
		expect(rumDomain("")).toBeUndefined();
		expect(() => rumDomain("not a domain")).toThrow(InputError);
	});
});
