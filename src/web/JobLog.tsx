import { useEffect, useRef, useState } from "react";
import { AgentSignIn, signedOutAgent } from "./AgentSignIn.js";
import type { EdsEvent, Job } from "./api.js";
import { Icon } from "./Icon.js";
import { type LogState, madeVersionWithIssues, stateLabel } from "./jobState.js";

interface Line {
	key: number;
	kind: "log" | "agent" | "cost";
	level?: string;
	text: string;
	meta?: string;
}

const seconds = (ms: unknown) => (typeof ms === "number" ? `${(ms / 1000).toFixed(1)}s` : "");

function toLine(e: EdsEvent, key: number): Line | null {
	if (e.type === "log" && typeof e.message === "string")
		return { key, kind: "log", level: String(e.level), text: e.message };
	if (e.type === "agent")
		return {
			key,
			kind: "agent",
			level: e.failed ? "warn" : "info",
			text: String(e.label),
			meta: `${seconds(e.durationMs)}${e.failed ? " · failed" : ""}`,
		};
	if (e.type === "agent-result")
		return {
			key,
			kind: "cost",
			text: "Agent finished",
			meta: [seconds(e.durationMs), typeof e.costUsd === "number" ? `$${e.costUsd.toFixed(3)}` : ""]
				.filter(Boolean)
				.join(" · "),
		};
	return null;
}

/**
 * One `eds` job's lines as they arrive (Server-Sent Events), its status and
 * cost; `onEnd` gets the job and all its events when it ends.
 */
export function useJobLines(
	job: Job,
	onEndCb?: (job: Job, events: EdsEvent[]) => void,
	onGoneCb?: () => void,
) {
	const [lines, setLines] = useState<Line[]>([]);
	const [status, setStatus] = useState<LogState>(job.status);
	const [cost, setCost] = useState<number | null>(null);
	const [tookMs, setTookMs] = useState<number | null>(null);
	const [issues, setIssues] = useState(false);
	const onEnd = useRef(onEndCb);
	onEnd.current = onEndCb;
	const onGone = useRef(onGoneCb);
	onGone.current = onGoneCb;
	const initial = useRef(job.status);
	initial.current = job.status;

	useEffect(() => {
		setLines([]);
		setIssues(false);
		setStatus(initial.current === "queued" ? "queued" : "running");
		const events: EdsEvent[] = [];
		const src = new EventSource(`/api/jobs/${job.id}/events`);
		let n = 0;
		src.addEventListener("eds", (m) => {
			const e = JSON.parse((m as MessageEvent).data) as EdsEvent;
			events.push(e);
			if (e.type === "agent-result" && typeof e.costUsd === "number") setCost(e.costUsd);
			if (madeVersionWithIssues([e])) setIssues(true);
			const line = toLine(e, n++);
			if (!line) return;
			// The CLI also prints each agent step as a log line just before its
			// `agent` event; show the structured one only.
			setLines((l) => {
				const prev = l.at(-1);
				if (line.kind === "agent" && prev?.kind === "log" && prev.text.startsWith(line.text))
					return [...l.slice(0, -1), line];
				return [...l, line];
			});
		});
		src.addEventListener("end", (m) => {
			const ended = JSON.parse((m as MessageEvent).data) as Job;
			setStatus(ended.status);
			if (ended.endedAt)
				setTookMs(new Date(ended.endedAt).getTime() - new Date(ended.startedAt).getTime());
			src.close();
			onEnd.current?.(ended, events);
		});
		// The stream failing before anything came: a run the server no longer knows (the studio
		// restarted since it ran) ends here, instead of waiting on "Starting eds…" forever.
		src.onerror = () => {
			src.close();
			if (events.length) return;
			fetch(`/api/jobs/${job.id}`).then(
				(r) => {
					if (r.status !== 404) return;
					setStatus("gone");
					onGone.current?.();
				},
				() => {},
			);
		};
		return () => src.close();
	}, [job.id]);

	// A round that made a version with issues ended with something to review, not a failure.
	const ended = status === "done" || status === "failed";
	return { lines, status: ended && issues ? ("issues" as const) : status, cost, tookMs };
}

/** Live log of one `eds` job, streamed from the server (Server-Sent Events). */
export function JobLog(props: {
	job: Job;
	onEnd?: (job: Job, events: EdsEvent[]) => void;
	/** The studio no longer knows the run (it restarted since): its result is in the drafts, not here. */
	onGone?: () => void;
	title?: string;
	/** Start and stay open (the Agents tab, where you open a job to read its log). */
	keepOpen?: boolean;
}) {
	const { job } = props;
	const { lines, status, cost, tookMs } = useJobLines(job, props.onEnd, props.onGone);
	const [copied, setCopied] = useState(false);
	// A log starts folded to its newest line; a failed run opens, so its reason shows.
	const [open, setOpen] = useState(!!props.keepOpen);
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (status === "failed") setOpen(true);
	}, [status]);

	useEffect(() => {
		const el = box.current;
		if (el && lines.length) el.scrollTop = el.scrollHeight;
	}, [lines]);

	const noLines =
		status === "gone"
			? "The studio restarted since this ran, so its log is gone. What it made is in Drafts."
			: "Starting eds…";
	const signedOut =
		status === "failed" ? signedOutAgent(lines.map((l) => l.text).join("\n")) : null;
	const summary = [
		status === "running"
			? lines.length || !job.waitingFor
				? "working…"
				: `queued: ${job.waitingFor}`
			: status === "queued"
				? `queued: ${job.waitingFor ?? "waiting"}`
				: stateLabel(status),
		tookMs !== null ? `${(tookMs / 1000).toFixed(1)}s` : "",
		cost !== null ? `$${cost.toFixed(3)}` : "",
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className={`job job-${status}${open ? "" : " job-folded"}`}>
			<div className="job-head">
				<button
					type="button"
					className="job-toggle"
					aria-expanded={open}
					onClick={() => setOpen((o) => !o)}
				>
					<span className="job-chevron">
						<Icon name="chevron" size={14} />
					</span>
					<span className={`dot dot-${status}`} />
					<strong>{props.title ?? job.kind}</strong>
					<span className="muted">{summary}</span>
				</button>
				{open && lines.length > 0 && (
					<button
						type="button"
						className="btn btn-ghost btn-sm"
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(
									lines.map((l) => (l.meta ? `${l.text}  ${l.meta}` : l.text)).join("\n"),
								);
								setCopied(true);
								setTimeout(() => setCopied(false), 1500);
							} catch {}
						}}
					>
						{copied ? "Copied" : "Copy log"}
					</button>
				)}
			</div>
			{!open && (
				<button type="button" className="job-latest" onClick={() => setOpen(true)}>
					{lines.at(-1)?.text ?? noLines}
				</button>
			)}
			<div className="job-log" ref={box} hidden={!open}>
				{lines.length === 0 && <div className="muted">{noLines}</div>}
				{lines.map((l) => (
					<div key={l.key} className={`ln ln-${l.kind} lv-${l.level ?? "info"}`}>
						<span className="ln-text">{l.text}</span>
						{l.meta && <span className="ln-meta">{l.meta}</span>}
					</div>
				))}
			</div>
			{signedOut && <AgentSignIn agent={signedOut} />}
		</div>
	);
}
