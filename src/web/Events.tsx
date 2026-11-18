import { useCallback, useEffect, useRef, useState } from "react";
import {
	api,
	type EventField,
	type Job,
	type OpenedPull,
	type Project,
	type ProjectEvents,
} from "./api.js";
import { confirmAction } from "./Confirm.js";
import { Icon } from "./Icon.js";
import { JobLog } from "./JobLog.js";

const SOURCES: Array<[EventField["from"], string]> = [
	["attr", "Element attribute"],
	["text", "Element text"],
	["builtin", "Built in"],
	["page", "From the page event"],
	["fixed", "Fixed value"],
];

const BUILTINS: Array<[key: string, label: string]> = [
	["block", "Block name"],
	["label", "Link or button label"],
	["href", "Link address"],
	["position", "Block position on the page"],
];

/** The project's events and the blocks that push each one, for the block dialog and Overview. */
export function useProjectEvents(projectId: string): [ProjectEvents | null, () => void] {
	const [events, setEvents] = useState<ProjectEvents | null>(null);
	const load = useCallback(() => {
		api.events(projectId).then(setEvents, () => setEvents({ defs: {}, uses: {} }));
	}, [projectId]);
	useEffect(load, [load]);
	return [events, load];
}

/**
 * The project's own events in Overview: each with its fields, read where the
 * event happens. Saving writes .edsrc.json and every block that pushes it, as
 * a pull request on a GitHub project.
 */
export function EventsCard(props: { project: Project }) {
	const [events, reload] = useProjectEvents(props.project.id);
	const [editing, setEditing] = useState<{
		name: string;
		fields: EventField[];
		isNew: boolean;
	} | null>(null);
	if (!events) return null;
	const names = Object.keys(events.defs).sort();
	return (
		<details className="overview-card events-card">
			<summary>
				<Icon name="chevron" size={14} />
				<strong>Your events</strong>
				<span className="overview-count">{names.length}</span>
				<span className="muted small overview-summary">
					what blocks push instead of block_click, form_submit and block_view
				</span>
			</summary>
			{names.length > 0 && (
				<ul className="events-list">
					{names.map((n) => (
						<li key={n}>
							<span className="mono">{n}</span>
							<span className="muted small">
								{events.defs[n].fields.map((f) => f.name).join(", ")}
								{events.uses[n]?.length ? ` · in ${events.uses[n].join(", ")}` : " · no block yet"}
							</span>
							<button
								type="button"
								className="btn btn-ghost btn-sm push-right"
								onClick={() => setEditing({ name: n, fields: events.defs[n].fields, isNew: false })}
							>
								Edit
							</button>
						</li>
					))}
				</ul>
			)}
			{!editing && (
				<button
					type="button"
					className="btn btn-ghost btn-sm"
					onClick={() =>
						setEditing({ name: "", fields: [{ name: "", from: "attr", key: "" }], isNew: true })
					}
				>
					<Icon name="plus" size={14} /> New event
				</button>
			)}
			{editing && (
				<EventEditor
					key={editing.name || "new"}
					project={props.project}
					start={editing}
					uses={events.uses[editing.name] ?? []}
					onDone={() => {
						setEditing(null);
						reload();
					}}
				/>
			)}
		</details>
	);
}

type Row = EventField & { rowKey: number };

function EventEditor(props: {
	project: Project;
	start: { name: string; fields: EventField[]; isNew: boolean };
	uses: string[];
	onDone: () => void;
}) {
	const { project } = props;
	const nextKey = useRef(0);
	const keyed = (fs: EventField[]) => fs.map((f) => ({ ...f, rowKey: nextKey.current++ }));
	const [name, setName] = useState(props.start.name);
	const [rows, setRows] = useState<Row[]>(() => keyed(props.start.fields));
	const [job, setJob] = useState<Job | null>(null);
	const [branch, setBranch] = useState<string | null>(null);
	const [pull, setPull] = useState<OpenedPull | null>(null);
	const [error, setError] = useState("");
	const github = project.source.type === "github";
	const set = (i: number, patch: Partial<EventField>) =>
		setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

	const run = async (save: () => Promise<{ job: Job; branch: string | null }>) => {
		setError("");
		try {
			const r = await save();
			setBranch(r.branch);
			setJob(r.job);
		} catch (e) {
			setError((e as Error).message);
		}
	};
	const ended = async (j: Job) => {
		if (j.status !== "done") return;
		if (branch) {
			try {
				setPull(await api.eventPull(project.id, name, branch));
			} catch (e) {
				setError((e as Error).message);
			}
		} else props.onDone();
	};
	const fields = rows.map(({ rowKey, ...f }) => f);

	return (
		<div className="event-editor">
			<div className="pm-bar">
				<label className="muted small">
					Event name{" "}
					<input
						className="mono"
						aria-label="The event's name"
						placeholder="promo_click"
						value={name}
						disabled={!props.start.isNew}
						onChange={(e) => setName(e.target.value.replace(/[^\w:.-]/g, ""))}
					/>
				</label>
				{props.uses.length > 0 && (
					<span className="muted small">Saving writes it again in {props.uses.join(", ")}.</span>
				)}
			</div>
			<div className="pm-table">
				{rows.map((f, i) => (
					<div className="pm-row" key={f.rowKey}>
						<input
							className="mono"
							aria-label="Field name, a dot nests it"
							placeholder="promo.id"
							value={f.name}
							onChange={(e) => set(i, { name: e.target.value.replace(/[^\w$.]/g, "") })}
						/>
						<select
							aria-label="Where its value comes from"
							value={f.from}
							onChange={(e) => {
								const from = e.target.value as EventField["from"];
								set(i, {
									from,
									key: from === "builtin" ? "block" : from === "fixed" ? undefined : "",
									value: from === "fixed" ? "" : undefined,
								});
							}}
						>
							{SOURCES.map(([v, label]) => (
								<option key={v} value={v}>
									{label}
								</option>
							))}
						</select>
						{f.from === "builtin" ? (
							<select
								aria-label="Which value"
								value={f.key ?? "block"}
								onChange={(e) => set(i, { key: e.target.value })}
							>
								{BUILTINS.map(([k, label]) => (
									<option key={k} value={k}>
										{label}
									</option>
								))}
							</select>
						) : f.from === "fixed" ? (
							<input
								aria-label="The fixed value"
								value={f.value ?? ""}
								onChange={(e) => set(i, { value: e.target.value })}
							/>
						) : (
							<input
								className="mono"
								aria-label={
									f.from === "attr"
										? "Attribute, e.g. data-promo-id"
										: f.from === "text"
											? "CSS selector, empty for the element itself"
											: "Page event field, e.g. page.type"
								}
								placeholder={
									f.from === "attr" ? "data-promo-id" : f.from === "text" ? ".title" : "page.type"
								}
								value={f.key ?? ""}
								onChange={(e) => set(i, { key: e.target.value })}
							/>
						)}
						<button
							type="button"
							className="icon-btn icon-btn-sm"
							aria-label={`Remove ${f.name || "this field"}`}
							title="Remove"
							onClick={() => setRows(rows.filter((_, j) => j !== i))}
						>
							<Icon name="close" size={12} />
						</button>
					</div>
				))}
				<button
					type="button"
					className="btn btn-ghost btn-sm"
					onClick={() => setRows([...rows, ...keyed([{ name: "", from: "attr", key: "" }])])}
				>
					<Icon name="plus" size={14} /> Add a field
				</button>
			</div>
			<div className="pm-foot">
				<span className="muted small">
					{github
						? "Saving opens a pull request with .edsrc.json and the blocks that push it."
						: "Saving writes .edsrc.json and the blocks that push it."}
				</span>
				{!props.start.isNew && (
					<button
						type="button"
						className="btn btn-ghost btn-sm"
						disabled={job !== null && !job.endedAt}
						onClick={async () => {
							const ok = await confirmAction({
								title: `Remove ${name}?`,
								detail: "Blocks that push it go back to the default fields.",
								action: "Remove event",
							});
							if (ok) await run(() => api.removeEvent(project.id, name));
						}}
					>
						Remove
					</button>
				)}
				<button type="button" className="btn btn-ghost btn-sm" onClick={props.onDone}>
					Cancel
				</button>
				<button
					type="button"
					className="btn btn-accent btn-sm"
					disabled={!name || !fields.length || (job !== null && !job.endedAt)}
					onClick={() => void run(() => api.saveEvent(project.id, name, fields))}
				>
					{github ? "Save as pull request" : "Save"}
				</button>
			</div>
			{job && (
				<JobLog key={job.id} job={job} title={`Saving ${name}`} onEnd={(j) => void ended(j)} />
			)}
			{pull && (
				<p className="small">
					<a href={pull.url} target="_blank" rel="noreferrer">
						Pull request #{pull.number} ↗
					</a>{" "}
					<span className="muted">The event shows in blocks once it's merged.</span>
				</p>
			)}
			{error && <p className="error small">{error}</p>}
		</div>
	);
}
