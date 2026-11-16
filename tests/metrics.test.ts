import { describe, expect, it } from "vitest";
import { projectMetrics } from "../src/server/metrics.js";

const NOW = new Date("2026-11-16T12:00:00Z");
const draft = (versions: string[], accepted?: { version: number; at: string }) => ({
	status: accepted ? "accepted" : "open",
	versions: versions.map((createdAt, i) => ({ version: i + 1, createdAt })),
	...(accepted ? { accepted } : {}),
});

describe("what the studio saved a project", () => {
	it("counts accepted drafts, first tries, rounds and the time to accept", () => {
		const m = projectMetrics(
			[
				// Accepted at v1, 2 hours after it was made.
				draft(["2026-11-10T08:00:00Z"], { version: 1, at: "2026-11-10T10:00:00Z" }),
				// Three versions, accepted 6 hours after the first.
				draft(["2026-11-12T08:00:00Z", "2026-11-12T09:00:00Z", "2026-11-12T10:00:00Z"], {
					version: 3,
					at: "2026-11-12T14:00:00Z",
				}),
				// Accepted long ago: outside the 30 days.
				draft(["2026-01-01T08:00:00Z"], { version: 1, at: "2026-01-01T09:00:00Z" }),
				draft(["2026-11-15T08:00:00Z"]),
			],
			[],
			[],
			30,
			NOW,
		);
		expect(m.drafts).toEqual({ accepted: 2, firstTry: 1, rounds: 2, hoursToAccept: 4, open: 1 });
	});

	it("adds up the agents' numbered runs and their cost, leaving out housekeeping", () => {
		const m = projectMetrics(
			[],
			[
				{
					kind: "change",
					number: 1,
					startedAt: "2026-11-16T10:00:00Z",
					endedAt: "2026-11-16T10:12:00Z",
				},
				{
					kind: "new draft",
					number: 2,
					startedAt: "2026-11-16T11:00:00Z",
					endedAt: "2026-11-16T11:30:00Z",
				},
				{ kind: "preview", startedAt: "2026-11-16T11:00:00Z", endedAt: "2026-11-16T11:59:00Z" },
				{ kind: "change", number: 3, startedAt: "2026-11-16T11:58:00Z" },
			],
			[
				{ at: "2026-11-16T10:12:00Z", projectId: "p", agent: "claude", models: [], costUsd: 0.5 },
				{ at: "2026-11-16T11:30:00Z", projectId: "p", agent: "claude", models: [], costUsd: 1.25 },
			],
			1,
			NOW,
		);
		expect(m.agents).toEqual({ runs: 2, minutes: 42, costUsd: 1.75 });
		expect(projectMetrics([], [], [], 1, NOW).agents.costUsd).toBeNull();
	});
});
