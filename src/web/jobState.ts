import type { EdsEvent, Job } from "./api.js";

/** A version was made but fails a check: there's something to review, so it isn't a failure. */
export const madeVersionWithIssues = (events: EdsEvent[]) =>
	events.some((e) => e.type === "draft" && e.ok === false);

/** How a job ended for its dot and label: its status, or "issues" for a version with issues. */
export function jobState(job: Job): Job["status"] | "issues" {
	return (job.status === "done" || job.status === "failed") && madeVersionWithIssues(job.events)
		? "issues"
		: job.status;
}

/** What a log shows: the job's state, or "gone" for a run the studio no longer knows (it restarted since). */
export type LogState = Job["status"] | "issues" | "gone";

/** A job's state in words. */
export const stateLabel = (state: LogState) =>
	state === "issues" ? "ready with issues" : state === "gone" ? "no longer known" : state;
