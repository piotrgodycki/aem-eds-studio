import { describe, expect, it } from "vitest";
import { compareVersions } from "../src/server/eds.js";
import { gitAuthEnv } from "../src/server/github.js";
import * as v from "../src/server/validate.js";

describe("validation", () => {
	it("accepts kebab-case block names only", () => {
		expect(v.blockName("product-cards")).toBe("product-cards");
		for (const bad of ["Hero", "-x", "a_b", "hero--x", "", "a".repeat(65)])
			expect(() => v.blockName(bad)).toThrow(v.InputError);
	});
	it("accepts http(s) design links and the sample", () => {
		expect(v.design("sample")).toBe("sample");
		expect(v.design(" https://framer.com/x ")).toBe("https://framer.com/x");
		for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "--sample", "figma"])
			expect(() => v.design(bad)).toThrow(v.InputError);
	});
	it("accepts git branch names, not options or odd refs", () => {
		expect(v.branch("feature/hero-v2")).toBe("feature/hero-v2");
		for (const bad of ["-b", "a..b", "a//b", "a/", "x@{1}", "a b"])
			expect(() => v.branch(bad)).toThrow(v.InputError);
	});
	it("versions, agents and models", () => {
		expect(v.version("2")).toBe(2);
		expect(v.version(undefined)).toBeUndefined();
		expect(() => v.version("0")).toThrow();
		expect(v.agent("ollama")).toBe("ollama");
		expect(() => v.agent("bash")).toThrow();
		expect(v.model("qwen2.5-coder:14b")).toBe("qwen2.5-coder:14b");
		expect(() => v.model("--x")).toThrow();
	});
});

describe("helpers", () => {
	it("compares versions numerically", () => {
		expect(compareVersions("0.4.60", "0.4.59")).toBe(1);
		expect(compareVersions("0.4.9", "0.4.60")).toBe(-1);
		expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
	});
	it("hands git the token through the environment, not the command line", () => {
		const env = gitAuthEnv("t0ken");
		expect(env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
		expect(Buffer.from(env.GIT_CONFIG_VALUE_0.split(" ").pop() ?? "", "base64").toString()).toBe(
			"x-access-token:t0ken",
		);
	});
});

describe("how the design is read", () => {
	const figma = "https://www.figma.com/design/abc/File?node-id=1-2";
	const stitch = "https://stitch.withgoogle.com/projects/1";
	it("knows where a link points", () => {
		expect(v.designProvider(figma)).toBe("figma");
		expect(v.designProvider("https://acme.framer.website/")).toBe("framer");
		expect(v.designProvider(stitch)).toBe("stitch");
		expect(v.designProvider("https://example.com/")).toBe("web");
	});
	it("maps Figma REST / MCP, screenshot and refresh to eds flags", () => {
		expect(v.sourceArgs(figma, { read: "mcp", screenshot: true, refresh: true }, false)).toEqual([
			"--mcp",
			"--screenshot",
			"--refresh",
		]);
		expect(v.sourceArgs(figma, { read: "rest", screenshot: true }, true)).toEqual(["--screenshot"]);
		expect(() => v.sourceArgs(figma, { read: "rest" }, false)).toThrow(/Figma token/);
		expect(() => v.sourceArgs(figma, { read: "--evil" }, true)).toThrow();
	});
	it("reads a Figma export from disk: no flags, no screenshot or re-fetch", () => {
		expect(v.sourceArgs(figma, { read: "export", screenshot: true, refresh: true }, false)).toEqual(
			[],
		);
		const png = { name: "Hero.PNG", data: Buffer.from("png").toString("base64") };
		expect(v.designExport(png)).toMatchObject({ extension: ".png" });
		expect(() => v.designExport({ name: "hero.pdf", data: "eA==" })).toThrow(/PNG, SVG/);
		expect(() => v.designExport({ name: "hero.png", data: "" })).toThrow(/empty/);
		const big = Buffer.alloc(15 * 1024 * 1024 + 1).toString("base64");
		expect(() => v.designExport({ name: "hero.png", data: big })).toThrow(/15 MB/);
	});
	it("scrapes other pages publicly or with a signed-in session", () => {
		expect(v.sourceArgs(stitch, { signedIn: true }, false)).toEqual(["--auth"]);
		expect(v.sourceArgs(stitch, { screenshot: true }, false)).toEqual(["--screenshot"]);
		expect(v.sourceArgs(stitch, { read: "mcp", signedIn: false }, false)).toEqual([]);
		expect(v.sourceArgs("sample", { refresh: true, signedIn: true }, false)).toEqual([]);
	});
});

describe("ticket branches", () => {
	it("takes a team's ticket key, and turns a ticket into its branch", () => {
		expect(v.ticketKey("curly")).toBe("CURLY");
		expect(v.ticketKey("")).toBeUndefined();
		expect(() => v.ticketKey("CURLY-1")).toThrow(/ticket key/);
		expect(v.ticketBranch({ type: "feature", number: "111" }, "CURLY")).toBe("feature/CURLY-111");
		expect(v.ticketBranch({ type: "bug", number: 123 }, "CURLY")).toBe("bug/CURLY-123");
		// Without a key the project doesn't use ticket branches: no ticket needed.
		expect(v.ticketBranch(undefined, undefined)).toBeUndefined();
	});

	it("asks for the ticket when it's missing or isn't one", () => {
		for (const bad of [
			undefined,
			{ type: "feature" },
			{ type: "chore", number: "1" },
			{ type: "bug", number: "1/../x" },
		])
			expect(() => v.ticketBranch(bad, "CURLY")).toThrow(v.TicketNeeded);
	});
});

describe("block analytics", () => {
	it("turns the choice into eds track block's arguments", () => {
		expect(
			v.trackArgs({
				click: "hero_cta",
				submit: null,
				view: "hero_view",
				layers: ["dataLayer"],
				dispatch: true,
			}),
		).toEqual([
			"--click-event",
			"hero_cta",
			"--no-submit",
			"--view",
			"hero_view",
			"--layer",
			"dataLayer",
			"--dispatch",
		]);
		expect(v.trackArgs({ click: null, submit: "sent" })).toEqual([
			"--no-click",
			"--submit-event",
			"sent",
		]);
	});

	it("refuses nothing to track, bad names and bad layers", () => {
		expect(() => v.trackArgs({})).toThrow(/Pick something/);
		expect(() => v.trackArgs({ click: "--yes" })).toThrow(/event name/);
		expect(() => v.trackArgs({ click: "a", layers: ["window.x"] })).toThrow(/data layer/);
	});
});
