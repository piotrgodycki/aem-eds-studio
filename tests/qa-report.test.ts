import { describe, expect, it } from "vitest";
import {
	issueBody,
	issueTitle,
	previewLink,
	type QaReport,
	reportText,
	reportValues,
} from "../src/server/qa-report.js";
import { InputError } from "../src/server/validate.js";

const STYLE = {
	width: 1392,
	height: 40,
	font: "Inter",
	fontSize: "32px",
	fontWeight: "700",
	lineHeight: "40px",
	letterSpacing: "normal",
	color: "#1a1a1a",
	background: "#f4efe8",
	margin: "0 0 12 0",
	padding: "0 0 0 0",
	radius: "0px",
};

const report = (over: Partial<QaReport> = {}): QaReport => ({
	block: "card-list",
	selector: ".card-list > div > div > h2",
	device: "iPhone 12 Pro · 390px",
	text: "The heading should be 28px on a phone",
	values: reportValues(STYLE),
	preview: "https://feature-studio-1--site--acme.aem.page/",
	...over,
});

describe("a QA report", () => {
	it("keeps the known values, leaving out the defaults", () => {
		expect(reportValues(STYLE)).toEqual({
			size: "1392 × 40",
			font: "Inter 32px / 40px · 700",
			color: "#1a1a1a",
			background: "#f4efe8",
			margin: "0 0 12 0",
			padding: "0 0 0 0",
		});
	});

	it("can't be broken out of by what the page sends", () => {
		const values = reportValues({
			...STYLE,
			color: "red | ![x](https://evil.example)\n# hi",
			extra: "x",
		});
		expect(values.color).not.toMatch(/[|\n]/);
		expect(values).not.toHaveProperty("extra");
	});

	it("names the block, the element and the device, with the values, the draft and the screenshot", () => {
		const r = report();
		expect(issueTitle(r)).toBe(
			"QA: card-list h2 on iPhone 12 Pro · 390px: The heading should be 28px on a phone",
		);
		const body = issueBody(
			r,
			"https://github.com/acme/site/blob/qa-screenshots/qa/card-list/1.png?raw=true",
		);
		expect(body).toContain("The heading should be 28px on a phone");
		expect(body).toContain("**Element:** `.card-list > div > div > h2`");
		expect(body).toContain("| Font | Inter 32px / 40px · 700 |");
		expect(body).toContain("**Draft:** https://feature-studio-1--site--acme.aem.page/");
		expect(body).toContain("![h2 in card-list](https://github.com/acme/site/blob/qa-screenshots/");
	});

	it("needs to say what's wrong, and links only an aem.page or aem.live draft", () => {
		expect(() => reportText("  ")).toThrow(InputError);
		expect(previewLink("https://evil.example/")).toBeUndefined();
		expect(previewLink("javascript:alert(1)")).toBeUndefined();
		expect(previewLink("https://main--site--acme.aem.live/")).toBe(
			"https://main--site--acme.aem.live/",
		);
	});
});
