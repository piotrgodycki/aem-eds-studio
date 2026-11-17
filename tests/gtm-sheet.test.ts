import { describe, expect, it } from "vitest";
import { liveSite, readGtmSheet, sheetPath } from "../src/server/gtm-sheet.js";

const answer = (status: number, body: unknown) =>
	(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("the GTM container ID from the content sheet", () => {
	it("reads the gtm-id row from the live site", async () => {
		const f = answer(200, {
			data: [
				{ Key: "other", Value: "x" },
				{ Key: "gtm-id", Value: " GTM-ABC1234 " },
			],
		});
		expect(await readGtmSheet("Acme/Site", "/analytics", f)).toEqual({
			url: "https://main--site--acme.aem.live/analytics.json",
			id: "GTM-ABC1234",
		});
	});

	it("says why there is no ID", async () => {
		expect((await readGtmSheet("acme/site", "/analytics", answer(404, {}))).error).toContain(
			"isn't published",
		);
		expect(
			(await readGtmSheet("acme/site", "/analytics", answer(200, { data: [] }))).error,
		).toContain("no gtm-id row");
	});

	it("takes only a plain sheet path", () => {
		expect(sheetPath("/settings/analytics")).toBe("/settings/analytics");
		expect(() => sheetPath("https://evil.example/x")).toThrow();
		expect(() => sheetPath("/../x")).toThrow();
		expect(liveSite("Owner/Repo")).toBe("https://main--repo--owner.aem.live");
	});
});
