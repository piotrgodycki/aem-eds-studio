import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allowPermission } from "../src/desktop/permissions.js";
import { CSP, createApp, insideDir } from "../src/server/app.js";

describe("window permissions", () => {
	const studio = "http://127.0.0.1:51234";
	it("lets the studio write to the clipboard and nothing else", () => {
		expect(allowPermission("clipboard-sanitized-write", `${studio}/#/p/x`, studio)).toBe(true);
		for (const p of ["media", "geolocation", "notifications", "openExternal"])
			expect(allowPermission(p, `${studio}/`, studio)).toBe(false);
	});
	it("gives the block preview iframe nothing", () => {
		expect(allowPermission("clipboard-sanitized-write", "http://localhost:3000/", studio)).toBe(
			false,
		);
		expect(allowPermission("clipboard-sanitized-write", "not a url", studio)).toBe(false);
	});
});

describe("the UI server", () => {
	it("serves only files under the web folder", () => {
		const web = path.join(os.tmpdir(), "web");
		expect(insideDir(web, path.join(web, "assets", "a.js"))).toBe(true);
		expect(insideDir(web, web)).toBe(true);
		expect(insideDir(web, path.join(os.tmpdir(), "web-other", "secret.txt"))).toBe(false);
		expect(insideDir(web, path.join(web, "..", "x.txt"))).toBe(false);
	});

	it("falls back to index.html for a sibling folder and sends the CSP", async () => {
		const root = mkdtempSync(path.join(os.tmpdir(), "studio-web-"));
		const web = path.join(root, "web");
		mkdirSync(web);
		mkdirSync(path.join(root, "web-other"));
		writeFileSync(path.join(web, "index.html"), "<p>studio</p>");
		writeFileSync(path.join(root, "web-other", "secret.txt"), "secret");
		const app = createApp({ webDir: web });
		const res = await app.request("http://127.0.0.1:4600/..%2Fweb-other%2Fsecret.txt", {
			headers: { host: "127.0.0.1:4600" },
		});
		expect(await res.text()).toBe("<p>studio</p>");
		expect(res.headers.get("content-security-policy")).toBe(CSP);
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	});
});
