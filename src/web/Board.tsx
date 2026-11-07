import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon.js";
import { type BoardCard, type BoardColumn, type BoardData, api } from "./api.js";

const COLUMNS: Array<{ id: BoardColumn; title: string; hint: string }> = [
	{ id: "prepared", title: "Prepared", hint: "Issues ready to pick up" },
	{ id: "progress", title: "In progress", hint: "Draft pull requests" },
	{ id: "review", title: "Dev review", hint: "Waiting for a developer" },
	{ id: "qa", title: "QA", hint: "Approved or labelled qa" },
	{ id: "done", title: "Done", hint: "Last 14 days" },
];

/** Which columns each role cares about. */
const ROLES: Record<string, BoardColumn[]> = {
	all: ["prepared", "progress", "review", "qa", "done"],
	developer: ["prepared", "progress", "review"],
	qa: ["qa"],
	manager: ["prepared", "done"],
};

const ago = (iso: string) => {
	const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
	return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

function CardView({ card }: { card: BoardCard }) {
	const needsShot = card.column === "qa" && !card.screenshot;
	return (
		<li className={`board-card${card.column === "qa" && card.qaPassed ? " is-passed" : ""}`}>
			{card.column === "qa" && card.screenshot && (
				<a href={card.url} target="_blank" rel="noreferrer" className="board-shot">
					<img src={card.screenshot} alt={`Screenshot for #${card.number}`} loading="lazy" />
				</a>
			)}
			<div className="board-card-top">
				<span className="mono small muted">
					{card.kind === "pr" ? "PR" : "Issue"} #{card.number}
				</span>
				{card.ci && <span className={`ci ci-${card.ci}`} title={`CI: ${card.ci}`} />}
			</div>
			<a href={card.url} target="_blank" rel="noreferrer" className="board-title">
				{card.title}
			</a>
			<div className="board-tags">
				{card.changesRequested && <span className="tag warn">changes requested</span>}
				{card.qaPassed && <span className="tag ok">QA passed</span>}
				{needsShot && <span className="tag warn">no screenshot</span>}
				{card.labels
					.filter((l) => !["qa", "qa-passed"].includes(l.name.toLowerCase()))
					.slice(0, 3)
					.map((l) => (
						<span key={l.name} className="tag" style={{ borderColor: `#${l.color}` }}>
							{l.name}
						</span>
					))}
			</div>
			<div className="board-meta small muted">
				<span>
					by <b>{card.author}</b> · {ago(card.updatedAt)}
				</span>
				{card.next.length > 0 && card.column !== "done" && (
					<span>
						next: <b>{card.next.join(", ")}</b>
					</span>
				)}
			</div>
			{card.preview && card.column !== "done" && (
				<a href={card.preview} target="_blank" rel="noreferrer" className="board-preview small">
					<Icon name="external" size={12} /> Preview on aem.page
				</a>
			)}
		</li>
	);
}

/** The project's GitHub work, by who acts next. */
export function Board(props: { projectId: string }) {
	const [data, setData] = useState<BoardData | null>(null);
	const [error, setError] = useState<{ message: string; connect?: boolean } | null>(null);
	const [role, setRole] = useState<keyof typeof ROLES>("all");
	const [loading, setLoading] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setData(await api.board(props.projectId));
		} catch (e) {
			const err = e as Error & { connect?: boolean };
			setError({ message: err.message, connect: err.connect });
		} finally {
			setLoading(false);
		}
	}, [props.projectId]);
	useEffect(() => {
		void load();
	}, [load]);

	const shown = COLUMNS.filter((c) => ROLES[role].includes(c.id));
	return (
		<section className="board">
			<div className="board-bar">
				<fieldset className="seg">
					<legend className="sr-only">Role</legend>
					{(["all", "developer", "qa", "manager"] as const).map((r) => (
						<button
							key={r}
							type="button"
							aria-pressed={role === r}
							className={role === r ? "on" : ""}
							onClick={() => setRole(r)}
						>
							{r === "all" ? "Everyone" : r === "qa" ? "QA" : r[0].toUpperCase() + r.slice(1)}
						</button>
					))}
				</fieldset>
				<span className="muted small">
					{data ? (
						<>
							<Icon name="github" size={13} /> {data.repo}
						</>
					) : null}
				</span>
				<button
					type="button"
					className="btn btn-outline btn-sm push-right"
					onClick={load}
					disabled={loading}
				>
					{loading ? "Loading…" : "Refresh"}
				</button>
			</div>
			{error && (
				<div className="empty">
					<p>{error.message}</p>
					{error.connect && (
						<p className="muted small">
							The token stays on this machine and is never sent to the window.
						</p>
					)}
				</div>
			)}
			{data && (
				<div
					className="board-cols"
					style={{
						gridTemplateColumns: `repeat(${shown.length}, minmax(250px, ${shown.length > 2 ? "1fr" : "340px"}))`,
					}}
				>
					{shown.map((col) => {
						const cards = data.cards.filter((c) => c.column === col.id);
						return (
							<div key={col.id} className={`board-col col-${col.id}`}>
								<div className="board-col-head">
									<span className="eyebrow">{col.title}</span>
									<span className="count">{cards.length}</span>
								</div>
								<p className="muted small">{col.hint}</p>
								<ul>
									{cards.map((c) => (
										<CardView key={`${c.kind}-${c.number}`} card={c} />
									))}
									{cards.length === 0 && <li className="board-empty muted small">Nothing here</li>}
								</ul>
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}
