import { describe, expect, it } from "vitest";
import { summarize, type UsageRun } from "../src/server/usage.js";

const now = new Date("2026-11-12T15:00:00");
const run = (at: string, over: Partial<UsageRun> = {}): UsageRun => ({
	at: new Date(at).toISOString(),
	projectId: "p",
	agent: "claude",
	models: ["claude-haiku-4-5"],
	tokens: { input: 100, output: 200, cacheRead: 1000, cacheWrite: 10 },
	costUsd: 0.01,
	...over,
});

describe("usage summary", () => {
	it("adds runs up for today, 7 and 30 days, per agent", () => {
		const s = summarize(
			[run("2026-11-12T09:00:00"), run("2026-11-08T09:00:00"), run("2026-10-20T09:00:00")],
			now,
		);
		const totals = (p: string) => s.periods.find((r) => r.period === p)?.totals;
		expect(totals("today")?.runs).toBe(1);
		expect(totals("7d")?.runs).toBe(2);
		expect(totals("30d")).toMatchObject({
			runs: 3,
			tokens: { input: 300, output: 600, cacheRead: 3000, cacheWrite: 30 },
		});
		expect(totals("30d")?.costUsd).toBeCloseTo(0.03);
		expect(s.models).toEqual([{ model: "claude-haiku-4-5", totals: totals("30d") }]);
	});

	it("keeps the plan limits each agent reported last", () => {
		const five = (usedPercent: number) => [{ window: "five_hour", usedPercent }];
		const s = summarize(
			[
				run("2026-11-12T10:00:00", { limits: five(30) }),
				run("2026-11-12T14:00:00", { limits: five(55) }),
				run("2026-11-12T14:30:00"), // no limits reported: the last known stay
			],
			now,
		);
		expect(s.limits).toEqual([
			{ agent: "claude", at: new Date("2026-11-12T14:00:00").toISOString(), limits: five(55) },
		]);
	});
});
