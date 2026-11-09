import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentEnv, fullPath, parseEnv } from "../src/desktop/env.js";
import { downloadUrl, isSignedBuild, updatesInPlace } from "../src/desktop/release.js";
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

describe("app updates", () => {
	it("updates in place everywhere but on an unsigned Mac", () => {
		expect(updatesInPlace("win32", false)).toBe(true);
		expect(updatesInPlace("linux", false)).toBe(true);
		expect(updatesInPlace("darwin", false)).toBe(false);
		expect(updatesInPlace("darwin", true)).toBe(true);
	});
	it("reads the signed flag the Desktop workflow sets", () => {
		expect(isSignedBuild('{"name":"aem-eds-studio","studioSigned":true}')).toBe(true);
		expect(isSignedBuild('{"name":"aem-eds-studio"}')).toBe(false);
		expect(isSignedBuild("not json")).toBe(false);
	});
	it("links the installer for this machine from the latest release", () => {
		const base = "https://github.com/piotrgodycki/aem-eds-studio/releases/latest/download/";
		expect(downloadUrl("darwin", "arm64")).toBe(`${base}AEM-EDS-Studio-mac-arm64.dmg`);
		expect(downloadUrl("darwin", "x64")).toBe(`${base}AEM-EDS-Studio-mac-x64.dmg`);
		expect(downloadUrl("win32", "x64")).toBe(`${base}AEM-EDS-Studio-win-x64.exe`);
	});
});

describe("the login shell's environment", () => {
	it("reads env between the markers and keeps only the agents' settings", () => {
		const out =
			"Welcome!\n__ENV__\nPATH=/opt/homebrew/bin:/usr/bin\nCLAUDE_CONFIG_DIR=/Users/p/.claude-work\nCODEX_HOME=/Users/p/.codex\nAWS_SECRET=nope\n__ENV__\nbye\n";
		const env = parseEnv(out);
		expect(env.PATH).toBe("/opt/homebrew/bin:/usr/bin");
		expect(agentEnv(env)).toEqual({
			CLAUDE_CONFIG_DIR: "/Users/p/.claude-work",
			CODEX_HOME: "/Users/p/.codex",
		});
		expect(parseEnv("no markers")).toEqual({});
	});
	it("puts the login shell's PATH first", () => {
		const out = fullPath("/usr/bin", "/opt/homebrew/bin:/usr/bin").split(path.delimiter);
		expect(out[0]).toBe("/opt/homebrew/bin");
		expect(out.filter((p) => p === "/usr/bin")).toHaveLength(1);
	});
});
