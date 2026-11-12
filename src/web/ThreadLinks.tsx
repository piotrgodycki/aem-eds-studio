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

	if (!threads.length) return null;
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
						{t.title}
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
