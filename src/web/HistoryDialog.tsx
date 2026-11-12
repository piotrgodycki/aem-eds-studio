import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, type Commit, type Project } from "./api.js";
import { Icon } from "./Icon.js";

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** The open project's git history; blocks accepted in the studio are marked. */
export function HistoryDialog(props: { project: Project | undefined; onClose: () => void }) {
	const { project, onClose } = props;
	const [commits, setCommits] = useState<Commit[] | null>(null);
	const [error, setError] = useState("");
	useEffect(() => {
		if (project) api.history(project.id).then(setCommits, (e: Error) => setError(e.message));
	}, [project]);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return createPortal(
		<div className="dialog-backdrop">
			<dialog
				open
				className="dialog panel history"
				aria-modal="true"
				aria-labelledby="history-title"
			>
				<span className="eyebrow">
					<Icon name="branch" size={13} /> History
				</span>
				<h2 id="history-title">{project ? project.name : "Project history"}</h2>
				{!project ? (
					<p className="muted">Open a project to see its history.</p>
				) : error ? (
					<p className="error">{error}</p>
				) : !commits ? (
					<p className="muted small">Reading the history…</p>
				) : commits.length === 0 ? (
					<p className="muted">No commits yet, or the folder isn't a git repository.</p>
				) : (
					<ol className="history-list">
						{commits.map((c) => (
							<li key={c.hash} className={c.accepted ? "accepted" : ""}>
								<div className="history-head">
									<strong>{c.subject}</strong>
									{c.accepted && <span className="tag ok">accepted in the studio</span>}
								</div>
								<span className="muted small">
									<code>{c.hash}</code> · {c.author} · {DATE.format(new Date(c.date))}
								</span>
							</li>
						))}
					</ol>
				)}
				<div className="row setup-foot">
					<button type="button" className="btn btn-accent push-right" onClick={onClose}>
						Close
					</button>
				</div>
			</dialog>
		</div>,
		document.body,
	);
}
