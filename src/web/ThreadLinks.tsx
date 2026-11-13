import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { Icon } from "./Icon.js";
import { href } from "./router.js";

/** Sent by the chat when a thread is added or deleted, so the side menu lists it again. */
export const THREADS_CHANGED = "studio:threads-changed";
const SHOWN = 8;

/** A thread dragged from here into a message, so its conversation goes along. */
export const THREAD_DRAG_TYPE = "application/x-studio-thread";
export interface DraggedThread {
	id: string;
	title: string;
}

type Summary = Awaited<ReturnType<typeof api.chats>>[number];

/**
 * When each thread's latest answer was seen, kept per project on this computer.
 * A thread first met here counts as seen, unless its agent is still working,
 * so only answers that land later get the new-answer dot.
 */
const seenKey = (projectId: string) => `studio:seen:${projectId}`;
function readSeen(projectId: string): Record<string, string> {
	try {
		return JSON.parse(localStorage.getItem(seenKey(projectId)) ?? "{}") as Record<string, string>;
	} catch {
		return {};
	}
}
function writeSeen(projectId: string, seen: Record<string, string>) {
	try {
		localStorage.setItem(seenKey(projectId), JSON.stringify(seen));
	} catch {}
}

/** Called by the open thread: its answers up to `at` have been seen. */
export function markSeen(projectId: string, threadId: string, at: string) {
	const seen = readSeen(projectId);
	if ((seen[threadId] ?? "") >= at) return;
	seen[threadId] = at;
	writeSeen(projectId, seen);
	window.dispatchEvent(new Event(THREADS_CHANGED));
}

function unseenAnswers(projectId: string, threads: Summary[]): Set<string> {
	const seen = readSeen(projectId);
	let met = false;
	for (const t of threads)
		if (!(t.id in seen)) {
			seen[t.id] = t.working ? "" : (t.answeredAt ?? "");
			met = true;
		}
	if (met) writeSeen(projectId, seen);
	return new Set(threads.filter((t) => t.answeredAt && t.answeredAt > seen[t.id]).map((t) => t.id));
}

/** The open project's chat threads in the side menu, under Chat, newest first. */
export function ThreadLinks(props: { projectId: string; current?: string }) {
	const [threads, setThreads] = useState<Summary[]>([]);
	const [all, setAll] = useState(false);
	const load = useCallback(
		() => api.chats(props.projectId).then(setThreads, () => setThreads([])),
		[props.projectId],
	);
	useEffect(() => {
		void load();
		window.addEventListener(THREADS_CHANGED, load);
		return () => window.removeEventListener(THREADS_CHANGED, load);
	}, [load]);
	// While an agent works in any thread, look again until it is done.
	const working = threads.some((t) => t.working);
	// biome-ignore lint/correctness/useExhaustiveDependencies: each new list starts the next look
	useEffect(() => {
		if (!working) return;
		const t = setTimeout(load, 2000);
		return () => clearTimeout(t);
	}, [working, threads, load]);

	if (!threads.length) return null;
	const unseen = unseenAnswers(props.projectId, threads);
	const shown = all ? threads : threads.slice(0, SHOWN);
	return (
		<ul className="side-threads" aria-label="Threads">
			{shown.map((t) => (
				<li key={t.id} className={t.id === props.current ? "on" : ""}>
					<a
						href={href.thread(props.projectId, t.id)}
						aria-current={t.id === props.current ? "page" : undefined}
						title={t.title}
						draggable
						onDragStart={(e) =>
							e.dataTransfer.setData(
								THREAD_DRAG_TYPE,
								JSON.stringify({ id: t.id, title: t.title } satisfies DraggedThread),
							)
						}
					>
						<span className="side-thread-title">{t.title}</span>
						{t.working ? (
							<span className="spinner spinner-sm" role="img" aria-label="Working" />
						) : (
							unseen.has(t.id) &&
							t.id !== props.current && (
								<span className="new-answer" role="img" aria-label="New answer" />
							)
						)}
					</a>
					<button
						type="button"
						className="icon-btn"
						aria-label={`Delete the thread “${t.title}”`}
						title="Delete thread"
						onClick={async () => {
							if (!confirm(`Delete the thread “${t.title}”?`)) return;
							await api.deleteChat(props.projectId, t.id);
							if (t.id === props.current) location.hash = href.project(props.projectId);
							void load();
						}}
					>
						<Icon name="trash" size={13} />
					</button>
				</li>
			))}
			{threads.length > SHOWN && (
				<li>
					<button type="button" className="side-more" onClick={() => setAll((a) => !a)}>
						{all ? "Show fewer" : `Show all ${threads.length}`}
					</button>
				</li>
			)}
		</ul>
	);
}
