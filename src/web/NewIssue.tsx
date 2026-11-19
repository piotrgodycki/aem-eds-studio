import { useEffect, useState } from "react";
import { api, type Project } from "./api.js";
import { Icon } from "./Icon.js";
import { IssueText } from "./IssueText.js";

type Kind = "feature" | "bug" | "task";
const KINDS: Array<[Kind, string]> = [
	["feature", "Feature"],
	["bug", "Bug"],
	["task", "Task"],
];

/** Where the issue goes, for the button: the project's tracker, else GitHub. */
function destination(project: Project): string {
	if (project.tracker?.kind === "jira") return "Jira";
	if (project.tracker?.kind === "ado") return "Azure DevOps";
	return "GitHub";
}

/**
 * The Manager's New issue, in two steps. The person gives a kind, a title, a few
 * notes and maybe the block; the agent writes the issue; the person edits and
 * accepts it, and only Create opens it in the tracker or on GitHub.
 */
export function NewIssue(props: { project: Project }) {
	const { project } = props;
	const [open, setOpen] = useState(false);
	const [kind, setKind] = useState<Kind>("feature");
	const [title, setTitle] = useState("");
	const [notes, setNotes] = useState("");
	const [block, setBlock] = useState("");
	const [blocks, setBlocks] = useState<string[]>([]);
	/** The agent's text, editable, once it has written it. */
	const [written, setWritten] = useState<{ title: string; body: string } | null>(null);
	const [editing, setEditing] = useState(false);
	const [busy, setBusy] = useState<"" | "writing" | "creating">("");
	const [created, setCreated] = useState<Array<{ label: string; url: string }>>([]);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!open || blocks.length) return;
		api.inventory(project.id).then(
			(inv) => setBlocks(inv.blocks.map((b) => b.name)),
			() => setBlocks([]),
		);
	}, [open, blocks.length, project.id]);

	const run = async (what: "writing" | "creating", fn: () => Promise<void>) => {
		setBusy(what);
		setError("");
		try {
			await fn();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy("");
		}
	};
	const write = () =>
		run("writing", async () => {
			const w = await api.writeIssue(project.id, {
				kind,
				title,
				details: notes,
				...(block ? { block } : {}),
			});
			setWritten({ title: w.title, body: w.body });
			setEditing(false);
		});
	const create = () =>
		run("creating", async () => {
			if (!written) return;
			const issue = await api.newIssue(project.id, { kind, ...written });
			setCreated([issue, ...created]);
			setWritten(null);
			setTitle("");
			setNotes("");
			setBlock("");
			setOpen(false);
		});

	return (
		<section className="home-box new-issue">
			<div className="row">
				<span className="label">Issues</span>
				{!open && (
					<button
						type="button"
						className="btn btn-outline btn-sm push-right"
						onClick={() => setOpen(true)}
					>
						<Icon name="plus" size={14} /> New issue
					</button>
				)}
			</div>
			{open && !written && (
				<form
					className="new-issue-form"
					onSubmit={(e) => {
						e.preventDefault();
						void write();
					}}
				>
					<fieldset className="seg seg-sm">
						<legend className="sr-only">Type</legend>
						{KINDS.map(([k, label]) => (
							<button
								key={k}
								type="button"
								className={kind === k ? "on" : ""}
								onClick={() => setKind(k)}
							>
								{label}
							</button>
						))}
					</fieldset>
					<label className="small">
						<span className="muted">Title</span>
						<input
							value={title}
							placeholder="Hero should show the price on mobile"
							onChange={(e) => setTitle(e.target.value)}
						/>
					</label>
					<label className="small">
						<span className="muted">Notes</span>
						<textarea
							rows={4}
							value={notes}
							placeholder="What and why, in your own words. The agent writes the issue from them."
							onChange={(e) => setNotes(e.target.value)}
						/>
					</label>
					<label className="small">
						<span className="muted">Block (optional, adds the pages it is on)</span>
						<select value={block} onChange={(e) => setBlock(e.target.value)}>
							<option value="">None</option>
							{blocks.map((b) => (
								<option key={b} value={b}>
									{b}
								</option>
							))}
						</select>
					</label>
					<div className="row">
						<button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
							Cancel
						</button>
						<button
							type="submit"
							className="btn btn-accent btn-sm push-right"
							disabled={!title.trim() || busy !== ""}
						>
							<Icon name="agent" size={14} />{" "}
							{busy === "writing" ? "The agent is writing…" : "Write it"}
						</button>
					</div>
				</form>
			)}
			{open && written && (
				<div className="new-issue-form">
					<p className="muted small">
						The agent's text. Read it and change what you like: nothing is sent until you press
						Create.
					</p>
					<label className="small">
						<span className="muted">Title</span>
						<input
							value={written.title}
							onChange={(e) => setWritten({ ...written, title: e.target.value })}
						/>
					</label>
					{editing ? (
						<textarea
							className="mono"
							rows={14}
							aria-label="The issue's text"
							value={written.body}
							onChange={(e) => setWritten({ ...written, body: e.target.value })}
						/>
					) : (
						<div className="new-issue-text">
							<IssueText text={written.body} />
						</div>
					)}
					<div className="row">
						<button type="button" className="btn btn-ghost btn-sm" onClick={() => setWritten(null)}>
							<Icon name="back" size={14} /> Back to the notes
						</button>
						<button
							type="button"
							className="btn btn-ghost btn-sm"
							onClick={() => setEditing(!editing)}
						>
							<Icon name={editing ? "eye" : "pencil"} size={14} /> {editing ? "Preview" : "Edit"}
						</button>
						<button
							type="button"
							className="btn btn-accent btn-sm push-right"
							disabled={!written.title.trim() || !written.body.trim() || busy !== ""}
							onClick={() => void create()}
						>
							{busy === "creating" ? "Creating…" : `Create in ${destination(project)}`}
						</button>
					</div>
				</div>
			)}
			{error && <p className="error small">{error}</p>}
			{created.length > 0 && (
				<ul className="home-rows">
					{created.map((c) => (
						<li key={c.url}>
							<a href={c.url} target="_blank" rel="noreferrer">
								{c.label} ↗
							</a>
							<span className="muted small push-right">just created</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
