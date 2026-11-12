import { useCallback, useEffect, useState } from "react";
import { api, type PullRequest } from "./api.js";

const STATUS_LABEL: Record<PullRequest["status"], string> = {
	open: "Open",
	draft: "Draft",
	merged: "Merged",
	closed: "Closed",
};
const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const OPEN_KEY = "studio:pulls-open";

/** A pull request dragged from here into the chat. */
export const PULL_DRAG_TYPE = "application/x-studio-pull";
export interface DraggedPull {
	number: number;
	title: string;
}

function PullList(props: { pulls: PullRequest[] }) {
	return (
		<ul className="pull-list">
			{props.pulls.map((pr) => (
				<li key={pr.number}>
					<a
						href={pr.url}
						target="_blank"
						rel="noreferrer"
						draggable
						onDragStart={(e) =>
							e.dataTransfer.setData(
								PULL_DRAG_TYPE,
								JSON.stringify({ number: pr.number, title: pr.title } satisfies DraggedPull),
							)
						}
						title={`${STATUS_LABEL[pr.status]} · #${pr.number} · ${pr.author} · ${DATE.format(new Date(pr.updatedAt))}`}
					>
						<span className={`pr-dot pr-${pr.status}`} />
						<span className="sr-only">{STATUS_LABEL[pr.status]}:</span>
						<span className="pull-title">{pr.title}</span>
					</a>
				</li>
			))}
		</ul>
	);
}

/** Whether the section is unfolded, remembered on this computer (on by default). */
function useRememberedOpen(): [boolean, (open: boolean) => void] {
	const [open, setOpen] = useState(() => {
		try {
			return localStorage.getItem(OPEN_KEY) !== "0";
		} catch {
			return true;
		}
	});
	const remember = (next: boolean) => {
		setOpen(next);
		try {
			localStorage.setItem(OPEN_KEY, next ? "1" : "0");
		} catch {}
	};
	return [open, remember];
}

/**
 * The open project's pull requests, folded into the sidebar like VS Code's
 * panels: open and draft ones first, merged and closed ones in an archive.
 * Nothing shows for a project without a GitHub repository.
 */
export function PullsPanel(props: { projectId: string }) {
	const [state, setState] = useState<Awaited<ReturnType<typeof api.pulls>> | null>(null);
	const [open, setOpen] = useRememberedOpen();
	const load = useCallback(
		() => api.pulls(props.projectId).then(setState, () => setState(null)),
		[props.projectId],
	);
	useEffect(() => {
		void load();
		window.addEventListener("focus", load);
		return () => window.removeEventListener("focus", load);
	}, [load]);

	if (!state?.repo) return null;
	const pulls = state.pulls ?? [];
	const live = pulls.filter((pr) => pr.status === "open" || pr.status === "draft");
	const done = pulls.filter((pr) => pr.status === "merged" || pr.status === "closed");
	return (
		<details
			className="side-section"
			open={open}
			onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
		>
			<summary>
				Pull requests
				{live.length > 0 && <span className="side-count">{live.length}</span>}
			</summary>
			{!state.pulls ? (
				<p className="muted small">{state.error ?? "Connect GitHub in Settings to see them."}</p>
			) : (
				<>
					{live.length ? <PullList pulls={live} /> : <p className="muted small">None open.</p>}
					{done.length > 0 && (
						<details className="side-archive">
							<summary>Merged / archive ({done.length})</summary>
							<PullList pulls={done} />
						</details>
					)}
				</>
			)}
		</details>
	);
}
