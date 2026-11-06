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
