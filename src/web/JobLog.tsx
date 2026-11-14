import { useEffect, useRef, useState } from "react";
import { AgentSignIn, signedOutAgent } from "./AgentSignIn.js";
import type { EdsEvent, Job } from "./api.js";
import { Icon } from "./Icon.js";
import { madeVersionWithIssues, stateLabel } from "./jobState.js";

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
export function useJobLines(job: Job, onEndCb?: (job: Job, events: EdsEvent[]) => void) {
	const [lines, setLines] = useState<Line[]>([]);
	const [status, setStatus] = useState(job.status);
	const [cost, setCost] = useState<number | null>(null);
	const [tookMs, setTookMs] = useState<number | null>(null);
	const [issues, setIssues] = useState(false);
	const onEnd = useRef(onEndCb);
	onEnd.current = onEndCb;
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
		src.onerror = () => src.close();
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
	title?: string;
	/** Stay open when the job ends (the Agents tab, where you open a job to read its log). */
	keepOpen?: boolean;
}) {
	const { job } = props;
	const { lines, status, cost, tookMs } = useJobLines(job, props.onEnd);
	const [copied, setCopied] = useState(false);
	const [open, setOpen] = useState(true);
	const box = useRef<HTMLDivElement>(null);

	// A finished job folds to its one-line summary; a failed one stays open, so its reason shows.
	useEffect(() => {
		if (status === "done" && !props.keepOpen) setOpen(false);
	}, [status, props.keepOpen]);

	useEffect(() => {
		const el = box.current;
		if (el && lines.length) el.scrollTop = el.scrollHeight;
	}, [lines]);

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
				<button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
					{open ? "Hide log" : "Show log"}
				</button>
				{lines.length > 0 && (
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
			<div className="job-log" ref={box} hidden={!open}>
				{lines.length === 0 && <div className="muted">Starting eds…</div>}
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
