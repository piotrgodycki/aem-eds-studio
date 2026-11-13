import { useEffect, useState } from "react";
import { api, type Draft, type Job } from "./api.js";
import { Icon } from "./Icon.js";
import { JobLog } from "./JobLog.js";
import { AGENTS } from "./ModelPicker.js";
import { href } from "./router.js";

/**
 * The Agents tab: every piece of agent work in the project since the studio
 * started, running first. Clicking one opens its live log right under it.
 */

/** Housekeeping jobs (the preview server, listings) aren't agent work. */
const HIDDEN = new Set(["preview", "list", "agents"]);

const VERBS: Record<string, string> = {
	"new draft": "Building",
	change: "Changing",
	accept: "Accepting",
	discard: "Discarding",
	describe: "Writing the pull request for",
	screenshots: "Screenshots of",
};

export function jobTitle(job: Job): string {
	if (job.kind === "chat") return "Answering in the chat";
	const verb = VERBS[job.kind];
	return verb && job.block ? `${verb} ${job.block}` : job.kind;
}

/** The agent a job runs, from its `--agent` argument, by name. */
export function agentOf(job: Job): string | undefined {
	const at = job.args.indexOf("--agent");
	if (at < 0) return undefined;
	const id = job.args[at + 1];
	return AGENTS.find((a) => a.id === id)?.label ?? id;
}

export const isLive = (job: Job) => job.status === "running" || job.status === "queued";

/** Running first, then queued, then the rest; newest first within each. */
const RANK: Record<Job["status"], number> = {
	running: 0,
	queued: 1,
	done: 2,
	failed: 2,
	stopped: 2,
};

const since = (iso: string) => {
	const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
	return m < 1 ? "now" : m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
};

/** The project's agent work, read again every few seconds while any of it runs. */
export function useProjectJobs(projectId: string): Job[] | null {
	const [jobs, setJobs] = useState<Job[] | null>(null);
	const live = jobs?.some(isLive) ?? false;
	useEffect(() => {
		let on = true;
		const read = () =>
			api.jobs(projectId).then(
				(list) =>
					on &&
					setJobs(
						list
							.filter((j) => !HIDDEN.has(j.kind))
							.sort(
								(a, b) => RANK[a.status] - RANK[b.status] || b.startedAt.localeCompare(a.startedAt),
							),
					),
				() => {},
			);
		void read();
		const t = setInterval(read, live ? 2000 : 8000);
		return () => {
			on = false;
			clearInterval(t);
		};
	}, [projectId, live]);
	return jobs;
}

export function Agents(props: { projectId: string; jobs: Job[] | null; job?: string }) {
	const { projectId, jobs } = props;
	const [drafts, setDrafts] = useState<Draft[]>([]);
	useEffect(() => {
		api.drafts(projectId).then(setDrafts, () => {});
	}, [projectId]);
	if (!jobs) return <p className="muted">Loading…</p>;
	if (!jobs.length)
		return (
			<div className="empty">
				<p>No agent has worked in this project since the studio started.</p>
				<p className="muted small">
					Building or changing a block, and answers in the chat, show up here with their live log.
				</p>
			</div>
		);
	return (
		<ul className="agents-list" aria-label="Agent work">
			{jobs.map((j) => {
				const open = j.id === props.job;
				return (
					<li key={j.id} className={open ? "open" : ""}>
						<a
							href={open ? href.agents(projectId) : href.agents(projectId, j.id)}
							aria-expanded={open}
						>
							<span className={`dot dot-${j.status}`} />
							<span className="agents-what">
								<strong>{jobTitle(j)}</strong>
								<span className="muted small">
									{[agentOf(j), j.status, since(j.startedAt)].filter(Boolean).join(" · ")}
								</span>
							</span>
							<Icon name="chevron" size={14} />
						</a>
						{open && (
							<AgentLog
								projectId={projectId}
								job={j}
								hasDraft={!!j.block && drafts.some((d) => d.name === j.block)}
							/>
						)}
					</li>
				);
			})}
		</ul>
	);
}

/** An agent's live log, opened under it, with Stop, its review and Close. */
function AgentLog(props: { projectId: string; job: Job; hasDraft: boolean }) {
	const { projectId, job } = props;
	return (
		<div className="agents-log">
			<div className="row">
				{isLive(job) && (
					<button
						type="button"
						className="btn btn-outline btn-sm"
						onClick={() => void api.stopJob(job.id)}
					>
						<Icon name="stop" size={13} /> Stop
					</button>
				)}
				{props.hasDraft && (
					<a className="btn btn-ghost btn-sm" href={href.draft(projectId, job.block ?? "")}>
						Open the review
					</a>
				)}
				<a className="btn btn-ghost btn-sm agents-close" href={href.agents(projectId)}>
					Close
				</a>
			</div>
			<JobLog key={job.id} job={job} title={jobTitle(job)} />
		</div>
	);
}
