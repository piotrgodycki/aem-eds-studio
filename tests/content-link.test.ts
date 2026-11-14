import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentInfo, contentLink } from "../src/server/content-link.js";
import { InputError } from "../src/server/validate.js";

describe("contentLink", () => {
	it("accepts a DA link on da.live and a UE link on Adobe's editor or an AEM author", () => {
		expect(contentLink({ source: "da", url: "https://da.live/edit#/acme/site" })?.url).toBe(
			"https://da.live/edit#/acme/site",
		);
		expect(
			contentLink({
				source: "ue",
				url: "https://experience.adobe.com/#/@acme/aem/editor/canvas/author-p1-e2.adobeaemcloud.com/content/site/index.html",
			})?.source,
		).toBe("ue");
		expect(
			contentLink({ source: "ue", url: "https://author-p1-e2.adobeaemcloud.com/ui#/aem" })?.source,
		).toBe("ue");
		expect(contentLink(null)).toBeUndefined();
	});

	it("refuses a link that isn't what it says it is", () => {
		for (const bad of [
			{ source: "da", url: "https://experience.adobe.com/#/x" },
			{ source: "ue", url: "https://da.live/edit#/acme/site" },
			{ source: "da", url: "http://da.live/edit#/acme/site" },
			{ source: "da", url: "da.live/edit" },
			{ source: "docs", url: "https://da.live/" },
		])
			expect(() => contentLink(bad)).toThrow(InputError);
	});
});

describe("contentInfo", () => {
	let root = "";
	beforeEach(async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "studio-content-"));
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("finds the DA editor from a content.da.live mountpoint", async () => {
		await writeFile(
			path.join(root, "fstab.yaml"),
			"mountpoints:\n  /: https://content.da.live/acme/site/\n",
		);
		const info = await contentInfo(root, undefined, "acme/other");
		expect(info).toMatchObject({
			detected: "da",
			saved: false,
			link: { source: "da", url: "https://da.live/edit#/acme/site" },
		});
	});

	it("uses the GitHub repository for a DA site with no fstab yet", async () => {
		const info = await contentInfo(root, undefined, "acme/site");
		expect(info.link?.url).toBe("https://da.live/edit#/acme/site");
	});

	it("knows a Universal Editor site by its component models, and has no link to guess", async () => {
		await writeFile(path.join(root, "component-definition.json"), "{}");
		const info = await contentInfo(root, undefined, "acme/site");
		expect(info.detected).toBe("ue");
		expect(info.link).toBeNull();
	});

	it("warns when the saved link's kind doesn't match the repository", async () => {
		await writeFile(path.join(root, "component-models.json"), "[]");
		const info = await contentInfo(
			root,
			{ source: "da", url: "https://da.live/edit#/acme/site" },
			"acme/site",
		);
		expect(info.saved).toBe(true);
		expect(info.warning).toMatch(/Universal Editor/);
	});

	it("says nothing for content in another place", async () => {
		await writeFile(
			path.join(root, "fstab.yaml"),
			"mountpoints:\n  /:\n    url: https://drive.google.com/drive/folders/abc\n",
		);
		const info = await contentInfo(root, undefined, "acme/site");
		expect(info).toMatchObject({ detected: "other", link: null });
	});
});
