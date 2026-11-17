import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pageMetaArg, readPageMeta } from "../src/server/page-meta.js";
import { InputError } from "../src/server/validate.js";

let root = "";
beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), "studio-page-meta-"));
	await mkdir(path.join(root, "scripts"));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("page_meta for the editor", () => {
	it("reads the properties and tells a written function from a stub", async () => {
		await writeFile(
			path.join(root, ".edsrc.json"),
			JSON.stringify({
				agent: "claude",
				pageMeta: {
					properties: [
						{ name: "loggedIn", from: "function", key: "isLoggedIn" },
						{ name: "tier", from: "function", key: "tier" },
						{ name: "brand", from: "fixed", value: "acme" },
					],
				},
			}),
		);
		await writeFile(
			path.join(root, "scripts", "page-meta-custom.js"),
			"/** a */\nexport function isLoggedIn() {\n  return document.cookie.includes('s=');\n}\n\n/** b */\nexport function tier() {\n  return undefined;\n}\n",
		);
		const view = await readPageMeta(root);
		// A config written before base:false shows its base fields, and its own under page.
		expect(view.properties).toHaveLength(10);
		expect(view.properties).toContainEqual({ name: "page.path", from: "builtin", key: "path" });
		expect(view.properties).toContainEqual({ name: "page.brand", from: "fixed", value: "acme" });
		expect(view.written).toEqual({ isLoggedIn: true, tier: false });
	});

	it("shows the default fields for a project without page_meta", async () => {
		const view = await readPageMeta(root);
		expect(view.event).toBe("page_meta");
		expect(view.properties).toHaveLength(7);
	});

	it("shows a whole custom event as it is saved", async () => {
		const pageMeta = {
			event: "page_view",
			base: false,
			properties: [{ name: "site.section", from: "url", index: 1 }],
		};
		await writeFile(path.join(root, ".edsrc.json"), JSON.stringify({ pageMeta }));
		expect(await readPageMeta(root)).toEqual({
			event: "page_view",
			properties: pageMeta.properties,
			written: {},
		});
	});

	it("passes the properties on as JSON, and refuses what isn't a list", () => {
		expect(
			JSON.parse(pageMetaArg([{ name: "a", from: "fixed", value: "x" }], "page_view")),
		).toEqual({
			event: "page_view",
			base: false,
			properties: [{ name: "a", from: "fixed", value: "x" }],
		});
		expect(() => pageMetaArg({ name: "a" }, "x")).toThrow(InputError);
	});
});
