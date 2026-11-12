import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { studioHome } from "./paths.js";

/**
 * Agent usage, as eds reports it in `agent-result` (aem-eds-kit 0.4.79+): the
 * run's tokens and API-equivalent cost, and the plan's usage windows (Claude
 * Code's 5-hour and weekly limits). Each run the studio starts is appended
 * to usage.jsonl; work done outside the studio isn't seen here.
 */

export interface TokenUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export interface PlanLimit {
	window: string;
	usedPercent: number;
	resetsAt?: string;
	status?: string;
}

export interface UsageRun {
	at: string;
	projectId: string;
	agent: string;
	models: string[];
	tokens?: TokenUsage;
	costUsd?: number;
	limits?: PlanLimit[];
}

interface AgentResult {
	type: "agent-result";
	agent?: string;
	models?: string[];
	tokens?: TokenUsage;
	costUsd?: number;
	limits?: PlanLimit[];
}

const usageFile = () => path.join(studioHome(), "usage.jsonl");

/** Keep one run from an `agent-result` event (older engines send no tokens: kept anyway). */
export async function recordUsage(projectId: string, e: AgentResult, now = new Date()) {
	const run: UsageRun = {
		at: now.toISOString(),
		projectId,
		agent: e.agent ?? "claude",
		models: e.models ?? [],
		...(e.tokens ? { tokens: e.tokens } : {}),
		...(typeof e.costUsd === "number" ? { costUsd: e.costUsd } : {}),
		...(e.limits?.length ? { limits: e.limits } : {}),
	};
	await mkdir(studioHome(), { recursive: true });
	await appendFile(usageFile(), `${JSON.stringify(run)}\n`);
}

export async function readUsage(): Promise<UsageRun[]> {
	if (!existsSync(usageFile())) return [];
	return (await readFile(usageFile(), "utf-8"))
		.split("\n")
		.filter(Boolean)
		.flatMap((line) => {
			try {
				return [JSON.parse(line) as UsageRun];
			} catch {
				return []; // a line cut short by a crash
			}
		});
}

export interface UsageTotals {
	runs: number;
	tokens: TokenUsage;
	costUsd: number;
}

export interface UsageSummary {
	/** The plan windows each agent last reported, and when. */
	limits: Array<{ agent: string; at: string; limits: PlanLimit[] }>;
	/** Today, the last 7 and the last 30 days, per agent. */
	periods: Array<{ period: "today" | "7d" | "30d"; agent: string; totals: UsageTotals }>;
	/** The last 30 days by model. */
	models: Array<{ model: string; totals: UsageTotals }>;
}

const empty = (): UsageTotals => ({
	runs: 0,
	tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	costUsd: 0,
});

function add(t: UsageTotals, run: UsageRun) {
	t.runs++;
	t.costUsd += run.costUsd ?? 0;
	if (run.tokens)
		for (const k of ["input", "output", "cacheRead", "cacheWrite"] as const)
			t.tokens[k] += run.tokens[k];
}

export function summarize(runs: UsageRun[], now = new Date()): UsageSummary {
	const startOfDay = new Date(now);
	startOfDay.setHours(0, 0, 0, 0);
	const since = {
		today: startOfDay.getTime(),
		"7d": now.getTime() - 7 * 86_400_000,
		"30d": now.getTime() - 30 * 86_400_000,
	};
	const latest = new Map<string, { agent: string; at: string; limits: PlanLimit[] }>();
	const periods = new Map<
		string,
		{ period: keyof typeof since; agent: string; totals: UsageTotals }
	>();
	const models = new Map<string, UsageTotals>();
	for (const run of runs) {
		const at = new Date(run.at).getTime();
		if (run.limits?.length && (latest.get(run.agent)?.at ?? "") < run.at)
			latest.set(run.agent, { agent: run.agent, at: run.at, limits: run.limits });
		for (const period of ["today", "7d", "30d"] as const) {
			if (at < since[period]) continue;
			const key = `${period}:${run.agent}`;
			const row = periods.get(key) ?? { period, agent: run.agent, totals: empty() };
			add(row.totals, run);
			periods.set(key, row);
		}
		if (at >= since["30d"])
			for (const model of run.models.length ? run.models : ["unknown"]) {
				const t = models.get(model) ?? empty();
				add(t, run);
				models.set(model, t);
			}
	}
	return {
		limits: [...latest.values()],
		periods: [...periods.values()],
		models: [...models.entries()].map(([model, totals]) => ({ model, totals })),
	};
}
