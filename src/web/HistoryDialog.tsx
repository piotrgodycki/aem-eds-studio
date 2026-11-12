import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, type Commit, type Project, type PullRequest } from "./api.js";
import { Icon } from "./Icon.js";

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const STATUS_LABEL: Record<PullRequest["status"], string> = {
	open: "Open",
	draft: "Draft",
	merged: "Merged",
	closed: "Closed",
};

function PullList(props: { pulls: PullRequest[] }) {
	return (
		<ul className="pull-list">
			{props.pulls.map((pr) => (
				<li key={pr.number}>
					<span className={`pr-dot pr-${pr.status}`} title={STATUS_LABEL[pr.status]} />
					<span className="sr-only">{STATUS_LABEL[pr.status]}:</span>
					<div className="pull-text">
						<a href={pr.url} target="_blank" rel="noreferrer">
							{pr.title}
						</a>
						<span className="muted small">
							#{pr.number} · {pr.author} · {DATE.format(new Date(pr.updatedAt))}
						</span>
					</div>
				</li>
			))}
		</ul>
	);
}

/** The project's pull requests: open ones first, merged and closed folded away. */
function Pulls(props: { project: Project }) {
	const [state, setState] = useState<Awaited<ReturnType<typeof api.pulls>> | null>(null);
	useEffect(() => {
		api
			.pulls(props.project.id)
			.then(setState, (e: Error) => setState({ repo: null, pulls: null, error: e.message }));
	}, [props.project.id]);

	if (!state) return <p className="muted small">Reading the pull requests…</p>;
	if (!state.repo) return <p className="muted small">No GitHub repository for this project.</p>;
	if (!state.pulls)
		return (
			<p className="muted small">
				{state.error ?? "Connect GitHub in Settings to see this repository's pull requests."}
			</p>
		);
	const live = state.pulls.filter((pr) => pr.status === "open" || pr.status === "draft");
	const done = state.pulls.filter((pr) => pr.status === "merged" || pr.status === "closed");
	return (
		<>
			{live.length ? (
				<PullList pulls={live} />
			) : (
				<p className="muted small">No open pull requests.</p>
			)}
			{done.length > 0 && (
				<details className="accepted">
					<summary className="muted small">Merged / archive ({done.length})</summary>
					<PullList pulls={done} />
				</details>
			)}
		</>
	);
}

/** The open project's pull requests and git history; blocks accepted in the studio are marked. */
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
				{project && (
					<section className="settings-section">
						<h3>Pull requests</h3>
						<Pulls project={project} />
					</section>
				)}
				{project && <h3 className="history-sub">Commits</h3>}
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
