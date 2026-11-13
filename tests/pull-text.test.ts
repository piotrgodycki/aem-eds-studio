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
		expect(body).toMatch(/^## Summary\nA hero/);
		expect(body).toContain(
			"| 1280px | ![hero at 1280px](https://github.com/x/blob/abc/blocks/hero/__snapshots__/hero-1280.png?raw=true) |",
		);
		expect(body).toContain(
			"Test URLs:\n- Before: https://main--curly-disco--piotrgodycki.aem.live/\n- After: https://draft-hero--curly-disco--piotrgodycki.aem.live/",
		);
	});

	it("says plainly what it is without the agent's text or screenshots", () => {
		const body = pullBody(base);
		expect(body).toMatch(/^The block `hero`, accepted at v5/);
		expect(body).not.toContain("Screenshots");
		expect(body).toContain("Test URLs:");
	});
});
