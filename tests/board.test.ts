import { describe, expect, it } from "vitest";
import { buildBoard, firstImage, previewUrl, type RawRepo } from "../src/server/board.js";

const label = (name: string) => ({ name, color: "ededed" });
const nodes = <T>(n: T[]) => ({ nodes: n });
const pr = (n: number, extra: Record<string, unknown> = {}) => ({
	number: n,
	title: `PR ${n}`,
	url: `https://github.com/acme/site/pull/${n}`,
	updatedAt: `2026-11-0${(n % 6) + 1}T10:00:00Z`,
	author: { login: "dev" },
	labels: nodes([]),
	assignees: nodes([]),
	closingIssuesReferences: nodes([] as Array<{ number: number }>),
	...extra,
});
const issue = (n: number, extra: Record<string, unknown> = {}) => ({
	number: n,
	title: `Issue ${n}`,
	url: `https://github.com/acme/site/issues/${n}`,
	updatedAt: "2026-11-05T10:00:00Z",
	author: { login: "manager" },
	labels: nodes([]),
	assignees: nodes([]),
	...extra,
});

const NOW = new Date("2026-11-06T12:00:00Z");

describe("work board", () => {
	const raw = {
		open: nodes([
			pr(1, { isDraft: true, headRefName: "feature/STUDIO-1" }),
			pr(2, {
				reviewDecision: "REVIEW_REQUIRED",
				reviewRequests: nodes([{ requestedReviewer: { login: "lead" } }]),
				commits: nodes([{ commit: { statusCheckRollup: { state: "FAILURE" } } }]),
				closingIssuesReferences: nodes([{ number: 10 }]),
			}),
			pr(3, { reviewDecision: "CHANGES_REQUESTED" }),
			pr(4, {
				reviewDecision: "APPROVED",
				headRefName: "feature/Hero_Block",
				body: 'Before ![desktop](https://img.example/d.png) and <img src="https://img.example/m.png">',
				commits: nodes([{ commit: { statusCheckRollup: { state: "SUCCESS" } } }]),
			}),
			pr(5, { labels: nodes([label("QA")]) }),
			pr(6, { labels: nodes([label("qa-passed")]), assignees: nodes([{ login: "qa-anna" }]) }),
		]),
		merged: nodes([
			pr(7, { mergedAt: "2026-11-05T09:00:00Z", closingIssuesReferences: nodes([{ number: 11 }]) }),
			pr(8, { mergedAt: "2026-09-01T09:00:00Z" }),
		]),
		issues: nodes([issue(10), issue(12, { assignees: nodes([{ login: "dev" }]) })]),
		closed: nodes([
			issue(11, { closedAt: "2026-11-05T09:00:00Z" }),
			issue(13, { closedAt: "2026-11-04T09:00:00Z" }),
			issue(14, { closedAt: "2026-11-04T09:00:00Z", stateReason: "NOT_PLANNED" }),
		]),
	} as unknown as RawRepo;
	const board = buildBoard("Acme/Site", raw, NOW);
	const col = (n: number, kind = "pr") =>
		board.cards.find((c) => c.number === n && c.kind === kind)?.column;

	it("sorts PRs by who acts next", () => {
		expect(col(1)).toBe("progress"); // draft
		expect(col(2)).toBe("review"); // needs a developer's review
		expect(col(3)).toBe("review"); // changes requested
		expect(col(4)).toBe("qa"); // approved
		expect(col(5)).toBe("qa"); // labelled QA
		expect(col(6)).toBe("qa"); // QA passed
	});

	it("keeps issues prepared until a PR takes them, and shows recent work as done", () => {
		expect(col(10, "issue")).toBeUndefined(); // shown through PR #2
		expect(col(12, "issue")).toBe("prepared");
		expect(col(7)).toBe("done");
		expect(col(8)).toBeUndefined(); // merged two months ago
		expect(col(11, "issue")).toBeUndefined(); // closed by PR #7
		expect(col(13, "issue")).toBe("done");
		expect(col(14, "issue")).toBeUndefined(); // not planned
	});

	it("tells who acts, CI, changes requested, QA state, preview and screenshot", () => {
		const c2 = board.cards.find((c) => c.number === 2);
		expect(c2).toMatchObject({ next: ["lead"], ci: "failure", closes: [10] });
		expect(board.cards.find((c) => c.number === 3)?.changesRequested).toBe(true);
		const c4 = board.cards.find((c) => c.number === 4);
		expect(c4).toMatchObject({
			ci: "success",
			preview: "https://feature-hero-block--site--acme.aem.page/",
			screenshot: "https://img.example/d.png",
		});
		expect(board.cards.find((c) => c.number === 5)?.screenshot).toBeNull();
		expect(board.cards.find((c) => c.number === 6)).toMatchObject({
			qaPassed: true,
			next: ["qa-anna"],
		});
	});
});

describe("helpers", () => {
	it("finds the first image in a PR description", () => {
		expect(firstImage('<img width="400" src="https://x.io/a.png"> ![b](https://x.io/b.png)')).toBe(
			"https://x.io/a.png",
		);
		expect(firstImage("no pictures here")).toBeNull();
		expect(firstImage(undefined)).toBeNull();
	});
	it("builds the aem.page preview host for a branch", () => {
		expect(previewUrl("piotrgodycki/aem-eds-kit", "bug/EDS-101")).toBe(
			"https://bug-eds-101--aem-eds-kit--piotrgodycki.aem.page/",
		);
	});
});
