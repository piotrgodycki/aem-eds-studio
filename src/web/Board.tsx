import { useCallback, useEffect, useState } from "react";
import {
	api,
	type BoardCard,
	type BoardColumn,
	type BoardData,
	type Draft,
	type Job,
} from "./api.js";
import { Icon } from "./Icon.js";
import { AGENTS } from "./ModelPicker.js";
import { href } from "./router.js";

const COLUMNS: Array<{ id: BoardColumn; title: string; hint: string }> = [
	{ id: "prepared", title: "Prepared", hint: "Issues ready to pick up" },
	{ id: "progress", title: "In progress", hint: "Draft pull requests and work in the studio" },
	{ id: "review", title: "Dev review", hint: "Pull requests and drafts waiting for a developer" },
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

/** Work in the studio itself, before any pull request: a running job or an open draft. */
interface StudioCard {
	key: string;
	column: BoardColumn;
	title: string;
	meta: string;
	link?: string;
	running?: boolean;
}

const JOB_TITLES: Record<string, string> = { "new draft": "Building", change: "Changing" };

const minutes = (since: string) => {
	const m = Math.round((Date.now() - new Date(since).getTime()) / 60_000);
	return m < 1 ? "just started" : `${m} min`;
};

/** The agent a job runs, from its `--agent` argument, by name. */
function agentOf(job: Job): string | undefined {
	const id = job.args[job.args.indexOf("--agent") + 1];
	return job.args.includes("--agent") ? (AGENTS.find((a) => a.id === id)?.label ?? id) : undefined;
}

function studioCards(projectId: string, jobs: Job[], drafts: Draft[]): StudioCard[] {
	const busy = jobs.filter(
		(j) => j.block && JOB_TITLES[j.kind] && (j.status === "running" || j.status === "queued"),
	);
	const working = busy.map((j) => ({
		key: `job-${j.id}`,
		column: "progress" as const,
		title: `${JOB_TITLES[j.kind]} ${j.block}`,
		meta: [agentOf(j), j.status === "queued" ? "queued" : minutes(j.startedAt)]
			.filter(Boolean)
			.join(" · "),
		link: drafts.some((d) => d.name === j.block) ? href.draft(projectId, j.block ?? "") : undefined,
		running: true,
	}));
	const waiting = drafts
		.filter((d) => d.status === "open" && !busy.some((j) => j.block === d.name))
		.map((d) => {
			const last = d.versions.at(-1);
			return {
				key: `draft-${d.name}`,
				column: "review" as const,
				title: `Draft ${d.name}`,
				meta: [last ? `v${last.version}` : "", last ? ago(last.createdAt) : "", "waits for review"]
					.filter(Boolean)
					.join(" · "),
				link: href.draft(projectId, d.name),
			};
		});
	return [...working, ...waiting];
}

function StudioCardView({ card }: { card: StudioCard }) {
	return (
		<li className="board-card studio-card">
			<div className="board-card-top">
				<span className="mono small muted">Studio</span>
				{card.running && <span className="spinner" aria-label="Running" />}
			</div>
			{card.link ? (
				<a href={card.link} className="board-title">
					{card.title}
				</a>
			) : (
				<span className="board-title">{card.title}</span>
			)}
			<div className="board-meta small muted">{card.meta}</div>
		</li>
	);
}

/** The project's work, by who acts next: GitHub's pull requests and issues, and the studio's own. */
export function Board(props: { projectId: string }) {
	const [data, setData] = useState<BoardData | null>(null);
	const [studio, setStudio] = useState<StudioCard[]>([]);
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
	// The studio's work changes by the minute: read it again while something runs.
	const running = studio.some((c) => c.running);
	useEffect(() => {
		const read = () =>
			Promise.all([api.jobs(props.projectId), api.drafts(props.projectId)]).then(
				([jobs, drafts]) => setStudio(studioCards(props.projectId, jobs, drafts)),
				() => {},
			);
		void read();
		if (!running) return;
		const t = setInterval(read, 3000);
		return () => clearInterval(t);
	}, [props.projectId, running]);

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
				<p className="board-note muted small">
					<Icon name="github" size={13} /> {error.message}{" "}
					{error.connect
						? "The token stays on this machine and is never sent to the window."
						: "Showing the work in the studio only."}
				</p>
			)}
			{(data || error) && (
				<div
					className="board-cols"
					style={{
						gridTemplateColumns: `repeat(${shown.length}, minmax(250px, ${shown.length > 2 ? "1fr" : "340px"}))`,
					}}
				>
					{shown.map((col) => {
						const cards = (data?.cards ?? []).filter((c) => c.column === col.id);
						const own = studio.filter((c) => c.column === col.id);
						return (
							<div key={col.id} className={`board-col col-${col.id}`}>
								<div className="board-col-head">
									<span className="eyebrow">{col.title}</span>
									<span className="count">{cards.length + own.length}</span>
								</div>
								<p className="muted small">{col.hint}</p>
								<ul>
									{own.map((c) => (
										<StudioCardView key={c.key} card={c} />
									))}
									{cards.map((c) => (
										<CardView key={`${c.kind}-${c.number}`} card={c} />
									))}
									{cards.length + own.length === 0 && (
										<li className="board-empty muted small">Nothing here</li>
									)}
								</ul>
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}
