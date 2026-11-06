import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fullPath } from "../src/desktop/env.js";
import { resetEds, resolveEds } from "../src/server/eds.js";

const fake = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures", "fake-eds.mjs");

describe("desktop app helpers", () => {
	afterEach(() => {
		Reflect.deleteProperty(process.versions, "electron");
		resetEds();
	});

	it("keeps the current PATH entries and adds no duplicates", () => {
		const sep = path.delimiter;
		const out = fullPath(["/a", "/b", "/a"].join(sep)).split(sep);
		expect(out).toContain("/a");
		expect(out).toContain("/b");
		expect(new Set(out).size).toBe(out.length);
	});

	it("runs a .js eds with this runtime, as Node inside Electron", async () => {
		process.env.EDS_BIN = fake;
		resetEds();
		expect((await resolveEds()).env).toEqual({});
		resetEds();
		Object.defineProperty(process.versions, "electron", { value: "38.0.0", configurable: true });
		const eds = await resolveEds();
		expect(eds.file).toBe(process.execPath);
		expect(eds.env).toEqual({ ELECTRON_RUN_AS_NODE: "1" });
	});
});
