import { useEffect, useRef, useState } from "react";
import { AgentSignIn, signedOutAgent } from "./AgentSignIn.js";
import type { EdsEvent, Job } from "./api.js";

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
	const onEnd = useRef(onEndCb);
	onEnd.current = onEndCb;
	const initial = useRef(job.status);
	initial.current = job.status;

	useEffect(() => {
		setLines([]);
		setStatus(initial.current === "queued" ? "queued" : "running");
		const events: EdsEvent[] = [];
		const src = new EventSource(`/api/jobs/${job.id}/events`);
		let n = 0;
		src.addEventListener("eds", (m) => {
			const e = JSON.parse((m as MessageEvent).data) as EdsEvent;
			events.push(e);
			if (e.type === "agent-result" && typeof e.costUsd === "number") setCost(e.costUsd);
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
			src.close();
			onEnd.current?.(ended, events);
		});
		src.onerror = () => src.close();
		return () => src.close();
	}, [job.id]);

	return { lines, status, cost };
}

/** Live log of one `eds` job, streamed from the server (Server-Sent Events). */
export function JobLog(props: {
	job: Job;
	onEnd?: (job: Job, events: EdsEvent[]) => void;
	title?: string;
}) {
	const { job } = props;
	const { lines, status, cost } = useJobLines(job, props.onEnd);
	const [copied, setCopied] = useState(false);
	const box = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = box.current;
		if (el && lines.length) el.scrollTop = el.scrollHeight;
	}, [lines]);

	const signedOut =
		status === "failed" ? signedOutAgent(lines.map((l) => l.text).join("\n")) : null;

	return (
		<div className={`job job-${status}`}>
			<div className="job-head">
				<span className={`dot dot-${status}`} />
				<strong>{props.title ?? job.kind}</strong>
				<span className="muted">
					{status === "running"
						? lines.length || !job.waitingFor
							? "working…"
							: `queued: ${job.waitingFor}`
						: status === "queued"
							? `queued: ${job.waitingFor ?? "waiting"}`
							: status}
					{cost !== null ? ` · $${cost.toFixed(3)}` : ""}
				</span>
				{lines.length > 0 && (
					<button
						type="button"
						className="btn btn-ghost btn-sm job-copy"
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
			<div className="job-log" ref={box}>
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
