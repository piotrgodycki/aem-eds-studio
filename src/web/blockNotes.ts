import type { BlockUsageResult } from "./api.js";

type Usage = BlockUsageResult["blocks"][number];

/** A count as people read it at a glance: 6.9k, 812. */
export const count = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

interface Note {
	kind: "unused" | "blind" | "clicks" | "wide";
	text: string;
}

/** What to do about a block, for estimating QA and development work; empty when nothing. */
export function notesFor(u: Usage, pagesRead: number, events: string[]): Note[] {
	const notes: Note[] = [];
	if (u.pages === 0 && u.name !== "header" && u.name !== "footer")
		return [{ kind: "unused", text: "is on no page, it can go" }];
	if (u.pages !== null && pagesRead > 0 && u.pages >= Math.max(10, pagesRead * 0.3))
		notes.push({ kind: "wide", text: `is on ${u.pages} pages, test widely when it changes` });
	if (u.views && u.clickRate !== null && u.views >= 100 && u.clickRate < 0.01)
		notes.push({
			kind: "clicks",
			text: `seen ${count(u.views)} times, only ${(u.clickRate * 100).toFixed(1)}% click it`,
		});
	if (!events.length && (u.views ? u.views >= 100 : (u.pages ?? 0) > 0))
		notes.push({
			kind: "blind",
			text: u.views ? `seen ${count(u.views)} times, sends no events` : "sends no events",
		});
	return notes;
}
