import type { Draft } from "./api.js";

/**
 * How many changes a draft has had. A draft is one working copy: its first
 * version is where it started, every one after it is a change.
 */
export const changeCount = (draft: Draft) => Math.max(0, draft.versions.length - 1);

/** "No changes yet", "1 change", "4 changes". */
export function changesLabel(draft: Draft): string {
	const n = changeCount(draft);
	return n === 0 ? "No changes yet" : `${n} change${n === 1 ? "" : "s"}`;
}
