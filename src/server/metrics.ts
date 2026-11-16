/**
 * What the studio saved a project, for whoever pays for it: drafts accepted,
 * how many rounds they took, how many went through at the first version, how
 * long from the first version to accepted, and the agents' time and cost.
 * Counted from `eds draft list`, the studio's job history and usage.jsonl.
 */

import type { UsageRun } from "./usage.js";

interface DraftLike {
	status: string;
	versions: Array<{ version: number; createdAt: string }>;
	accepted?: { version: number; at: string };
}

interface JobLike {
	kind: string;
	number?: number;
	startedAt: string;
	endedAt?: string;
}

export interface ProjectMetrics {
	days: number;
	drafts: {
		accepted: number;
		/** Accepted at their first version: no round of changes needed. */
		firstTry: number;
		/** Versions per accepted draft. */
		rounds: number | null;
		/** Median hours from a draft's first version to accepted. */
		hoursToAccept: number | null;
		open: number;
	};
	agents: {
		runs: number;
		minutes: number;
		/** API-equivalent cost, as the agents report it; null when none did. */
		costUsd: number | null;
	};
}

const median = (xs: number[]) => {
	if (!xs.length) return null;
	const s = [...xs].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function projectMetrics(
	drafts: DraftLike[],
	jobs: JobLike[],
	usage: UsageRun[],
	days: number,
	now = new Date(),
): ProjectMetrics {
	const since = now.getTime() - days * 86_400_000;
	const within = (iso?: string) => !!iso && new Date(iso).getTime() >= since;
	const accepted = drafts.filter((d) => d.status === "accepted" && within(d.accepted?.at));
	const hours = accepted
		.map((d) => {
			const first = d.versions[0]?.createdAt;
			return first && d.accepted
				? (new Date(d.accepted.at).getTime() - new Date(first).getTime()) / 3_600_000
				: null;
		})
		.filter((h): h is number => h !== null && h >= 0);
	// Agent work is the numbered jobs (housekeeping like previews and lists isn't counted).
	const work = jobs.filter((j) => j.number !== undefined && within(j.startedAt) && j.endedAt);
	const minutes = work.reduce(
		(s, j) =>
			s + (new Date(j.endedAt as string).getTime() - new Date(j.startedAt).getTime()) / 60_000,
		0,
	);
	const runs = usage.filter((u) => within(u.at));
	const costs = runs.map((u) => u.costUsd).filter((c): c is number => typeof c === "number");
	return {
		days,
		drafts: {
			accepted: accepted.length,
			firstTry: accepted.filter((d) => d.accepted?.version === d.versions[0]?.version).length,
			rounds: accepted.length
				? accepted.reduce((s, d) => s + d.versions.length, 0) / accepted.length
				: null,
			hoursToAccept: median(hours),
			open: drafts.filter((d) => d.status === "open").length,
		},
		agents: {
			runs: work.length,
			minutes: Math.round(minutes),
			costUsd: costs.length ? costs.reduce((s, c) => s + c, 0) : null,
		},
	};
}
