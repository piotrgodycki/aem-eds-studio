import { describe, expect, it } from "vitest";
import { pullBody } from "../src/server/pull-text.js";

describe("an accepted draft's pull request", () => {
	const base = {
		repo: "piotrgodycki/curly-disco",
		base: "main",
		branch: "draft/hero",
		name: "hero",
		version: 5,
	};

	it("carries the agent's text, the screenshots and the test URLs AEM PSI Check reads", () => {
		const body = pullBody({
			...base,
			description: "## Summary\nA hero with a bottom-left headline.",
			shots: [
				{
					width: 1280,
					url: "https://github.com/x/blob/abc/blocks/hero/__snapshots__/hero-1280.png?raw=true",
				},
			],
		});
		expect(body).toMatch(
			/^A hero with a bottom-left headline\.\n\nTest URLs:\n\n- Before: https:\/\/main--curly-disco--piotrgodycki\.aem\.live\/\n- After: https:\/\/draft-hero--curly-disco--piotrgodycki\.aem\.live\/\n\n## Screenshots/,
		);
		expect(body).not.toContain("## Summary");
		expect(body).toContain(
			"| 1280px | ![hero at 1280px](https://github.com/x/blob/abc/blocks/hero/__snapshots__/hero-1280.png?raw=true) |",
		);
	});

	it("puts at most three sentences above the test URLs and the rest of the text under them", () => {
		const body = pullBody({
			...base,
			description: "## Summary\nOne. Two. Three. Four.\n\n## Changes\n- full width\n- overlay text",
		});
		const [top, urls, ...rest] = body.split("\n\n");
		expect(top).toBe("One. Two. Three.");
		expect(urls).toBe("Test URLs:");
		expect(rest.join("\n\n")).toContain("## Summary\nFour.\n\n## Changes\n- full width");
	});

	it("says plainly what it is without the agent's text or screenshots", () => {
		const body = pullBody(base);
		expect(body).toMatch(/^The block `hero`, accepted at v5/);
		expect(body).not.toContain("Screenshots");
		expect(body).toContain("Test URLs:");
	});
});
