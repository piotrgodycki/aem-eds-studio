import { useEffect, useState } from "react";
import { api, type Draft, type Job } from "./api.js";
import { Icon } from "./Icon.js";
import { JobLog } from "./JobLog.js";
import { jobState, stateLabel } from "./jobState.js";
import { AGENTS } from "./ModelPicker.js";
import { href } from "./router.js";

/**
 * The Agents tab: the project's agent runs, kept across restarts. Each has a
 * number (AG-142) and a name saying what it did; they're grouped by what they
 * worked on (a block, a chat thread), with filters and a search. Clicking one
 * opens its log right under it.
 */

/** Housekeeping jobs (the preview server, listings) aren't agent work. */
const HIDDEN = new Set(["preview", "list", "agents"]);

const NAMES: Record<string, string> = {
	"new draft": "New draft",
	change: "Change",
	accept: "Accept",
	discard: "Discard",
	reopen: "Reopen",
	update: "Update",
	describe: "Pull request text for",
	screenshots: "Screenshots of",
};

/** The version a run made, from its `draft` event. */
const madeVersion = (job: Job) => {
	const d = job.events.find((e) => e.type === "draft");
	return typeof d?.version === "number" ? d.version : undefined;
};

/** What a run did, e.g. "Change hero → v3" or "Answer in “Hero redesign”". */
export function jobTitle(job: Job): string {
	if (job.kind === "chat") return job.subject ? `Answer in “${job.subject}”` : "Answer in the chat";
	// Analytics picked for a block runs as a change too (`eds track block … --draft`).
	const name = job.args[0] === "track" ? "Track" : NAMES[job.kind];
	const base = name && job.block ? `${name} ${job.block}` : job.kind;
	const v = madeVersion(job);
	return v ? `${base} → v${v}` : base;
}

/** The run's number as shown, e.g. AG-142. */
export const runId = (job: Job) => (job.number ? `AG-${job.number}` : "");

/** The agent a job runs, from its `--agent` argument, by name. */
export function agentOf(job: Job): string | undefined {
	const at = job.args.indexOf("--agent");
	if (at < 0) return undefined;
	const id = job.args[at + 1];
	return AGENTS.find((a) => a.id === id)?.label ?? id;
}

export const isLive = (job: Job) => job.status === "running" || job.status === "queued";

/** What the run was asked: the change's words (after `--`), for the row's second line. */
function requestOf(job: Job): string | undefined {
	const d = job.events.find((e) => e.type === "draft");
	if (typeof d?.feedback === "string") return d.feedback;
	const end = job.args.indexOf("--");
	return job.args[1] === "refine" && end >= 0 ? job.args.at(-1) : undefined;
}

const costOf = (job: Job) =>
	job.events.reduce(
		(sum, e) => sum + (e.type === "agent-result" && typeof e.costUsd === "number" ? e.costUsd : 0),
		0,
	);

function took(job: Job): string {
	const ms = Date.parse(job.endedAt ?? new Date().toISOString()) - Date.parse(job.startedAt);
	const s = Math.round(ms / 1000);
	return s < 60 ? `${s}s` : `${Math.floor(s / 60)} min ${s % 60}s`;
}

const since = (iso: string) => {
	const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
	return m < 1 ? "now" : m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
};

/** The project's agent work, newest first, read again every few seconds while any of it runs. */
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
							.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
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

type Filter = "all" | "working" | "issues" | "failed";
const FILTERS: Array<{ id: Filter; label: string; test: (j: Job) => boolean }> = [
	{ id: "all", label: "All", test: () => true },
	{ id: "working", label: "Working", test: isLive },
	{ id: "issues", label: "Issues", test: (j) => jobState(j) === "issues" },
	{ id: "failed", label: "Failed", test: (j) => jobState(j) === "failed" },
];

interface Group {
	key: string;
	name: string;
	/** A chat thread's title, or the draft's branch. */
	detail?: string;
	jobs: Job[];
}

/** Runs on the same block, or in the same chat thread, go together; newest group first. */
function groupRuns(jobs: Job[], drafts: Draft[]): Group[] {
	const groups = new Map<string, Group>();
	for (const j of jobs) {
		const chat = j.kind === "chat";
		const key = chat ? `chat:${j.subject ?? ""}` : `block:${j.block ?? j.kind}`;
		let g = groups.get(key);
		if (!g) {
			g = chat
				? { key, name: "Chat", detail: j.subject ? `“${j.subject}”` : undefined, jobs: [] }
				: {
						key,
						name: j.block ?? j.kind,
						detail: drafts.find((d) => d.name === j.block)?.branch,
						jobs: [],
					};
			groups.set(key, g);
		}
		g.jobs.push(j);
	}
	return [...groups.values()];
}

/** When a group last worked: Now while it runs, else by its newest run's day. */
function sectionOf(g: Group): string {
	if (g.jobs.some(isLive)) return "Now";
	const day = (d: Date) => d.toDateString();
	const at = new Date(g.jobs[0].startedAt);
	const today = new Date();
	const yesterday = new Date(Date.now() - 86_400_000);
	return day(at) === day(today) ? "Today" : day(at) === day(yesterday) ? "Yesterday" : "Earlier";
}
const SECTIONS = ["Now", "Today", "Yesterday", "Earlier"];

export function Agents(props: { projectId: string; jobs: Job[] | null; job?: string }) {
	const { projectId, jobs } = props;
	const [drafts, setDrafts] = useState<Draft[]>([]);
	const [filter, setFilter] = useState<Filter>("all");
	const [query, setQuery] = useState("");
	useEffect(() => {
		api.drafts(projectId).then(setDrafts, () => {});
	}, [projectId]);
	if (!jobs) return <p className="muted">Loading…</p>;
	if (!jobs.length)
		return (
			<div className="empty">
				<p>No agent has worked in this project yet.</p>
				<p className="muted small">
					Building or changing a block, and answers in the chat, show up here with their log.
				</p>
			</div>
		);

	const q = query.trim().toLowerCase();
	const test = FILTERS.find((f) => f.id === filter)?.test ?? (() => true);
	const shown = jobs.filter(
		(j) =>
			test(j) &&
			(!q ||
				[runId(j), jobTitle(j), j.block ?? "", j.subject ?? ""].some((s) =>
					s.toLowerCase().includes(q),
				)),
	);
	const groups = groupRuns(shown, drafts);

	return (
		<div className="runs">
			<div className="runs-bar">
				{FILTERS.map((f) => (
					<button
						key={f.id}
						type="button"
						className={`runs-chip${filter === f.id ? " on" : ""}`}
						aria-pressed={filter === f.id}
						onClick={() => setFilter(f.id)}
					>
						{f.label} <b>{jobs.filter(f.test).length}</b>
					</button>
				))}
				<input
					className="runs-search"
					type="search"
					placeholder="Search by name, ID or block…"
					aria-label="Search the runs"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
			</div>
			{!groups.length && <p className="muted small">Nothing matches.</p>}
			{SECTIONS.map((section) => {
				const here = groups.filter((g) => sectionOf(g) === section);
				if (!here.length) return null;
				return (
					<section key={section}>
						<h3 className="runs-section">{section}</h3>
						{here.map((g) => (
							<RunGroup
								key={g.key}
								group={g}
								projectId={projectId}
								open={props.job}
								hasDraft={(name) => drafts.some((d) => d.name === name)}
							/>
						))}
					</section>
				);
			})}
		</div>
	);
}

function RunGroup(props: {
	group: Group;
	projectId: string;
	open?: string;
	hasDraft: (name: string) => boolean;
}) {
	const { group, projectId } = props;
	const chat = group.key.startsWith("chat:");
	const n = group.jobs.length;
	return (
		<div className="runs-group">
			<div className="runs-head">
				<span className="mono">{group.name}</span>
				{group.detail &&
					(chat ? (
						<span className="muted small">{group.detail}</span>
					) : (
						<span className="tag runs-branch">{group.detail}</span>
					))}
				<span className="muted small runs-count">
					{n} {chat ? (n === 1 ? "answer" : "answers") : n === 1 ? "run" : "runs"}
				</span>
			</div>
			<ul className="runs-list">
				{group.jobs.map((j) => {
					const open = j.id === props.open;
					return (
						<li key={j.id} className={open ? "open" : ""}>
							<a
								href={open ? href.agents(projectId) : href.agents(projectId, j.id)}
								aria-expanded={open}
							>
								<span className={`dot dot-${jobState(j)}`} />
								<span className="runs-id">{runId(j)}</span>
								<span className="runs-what">
									<strong>{jobTitle(j)}</strong>
									<span className="muted small">
										{[
											agentOf(j),
											isLive(j) ? `started ${since(j.startedAt)} ago` : took(j),
											requestOf(j) && `“${requestOf(j)}”`,
										]
											.filter(Boolean)
											.join(" · ")}
									</span>
								</span>
								<RunResult job={j} />
								<span className="muted small runs-cost">
									{costOf(j) ? `$${costOf(j).toFixed(3)}` : "—"}
								</span>
								<Icon name="chevron" size={14} />
							</a>
							{open && (
								<AgentLog
									projectId={projectId}
									job={j}
									hasDraft={!!j.block && props.hasDraft(j.block)}
								/>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}

/** How a run came out: the version it made, ready with issues, failed, answered. */
function RunResult(props: { job: Job }) {
	const { job } = props;
	const state = jobState(job);
	if (isLive(job))
		return (
			<span className="muted small runs-result">
				{job.status === "queued" ? "queued" : "working…"}
			</span>
		);
	if (state === "issues") return <span className="tag warn runs-result">{stateLabel(state)}</span>;
	if (state === "failed") return <span className="tag bad runs-result">failed</span>;
	if (state === "stopped") return <span className="tag runs-result">stopped</span>;
	const v = madeVersion(job);
	if (v) return <span className="tag ok runs-result">v{v}</span>;
	return (
		<span className="muted small runs-result">{job.kind === "chat" ? "answered" : "done"}</span>
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
			<JobLog key={job.id} job={job} title={`${runId(job)} ${jobTitle(job)}`.trim()} keepOpen />
		</div>
	);
}
