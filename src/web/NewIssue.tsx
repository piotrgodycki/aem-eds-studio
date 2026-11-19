import { useEffect, useState } from "react";
import { api, type Project } from "./api.js";
import { Icon } from "./Icon.js";

/** Where the issue goes, for the button: the project's tracker, else GitHub. */
function destination(project: Project): string {
	if (project.tracker?.kind === "jira") return "Jira";
	if (project.tracker?.kind === "ado") return "Azure DevOps";
	return "GitHub";
}

/**
 * The Manager's New issue: a feature or a bug, its title and details, and the
 * block it is about, opened in the project's tracker or on GitHub.
 */
export function NewIssue(props: { project: Project }) {
	const { project } = props;
	const [open, setOpen] = useState(false);
	const [kind, setKind] = useState<"feature" | "bug">("feature");
	const [title, setTitle] = useState("");
	const [details, setDetails] = useState("");
	const [block, setBlock] = useState("");
	const [blocks, setBlocks] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [created, setCreated] = useState<Array<{ label: string; url: string }>>([]);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!open || blocks.length) return;
		api.inventory(project.id).then(
			(inv) => setBlocks(inv.blocks.map((b) => b.name)),
			() => setBlocks([]),
		);
	}, [open, blocks.length, project.id]);

	const create = async () => {
		setBusy(true);
		setError("");
		try {
			const issue = await api.newIssue(project.id, {
				kind,
				title,
				details,
				...(block ? { block } : {}),
			});
			setCreated([issue, ...created]);
			setTitle("");
			setDetails("");
			setBlock("");
			setOpen(false);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

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
			{open && (
				<form
					className="new-issue-form"
					onSubmit={(e) => {
						e.preventDefault();
						void create();
					}}
				>
					<fieldset className="seg seg-sm">
						<legend className="sr-only">Type</legend>
						<button
							type="button"
							className={kind === "feature" ? "on" : ""}
							onClick={() => setKind("feature")}
						>
							Feature
						</button>
						<button
							type="button"
							className={kind === "bug" ? "on" : ""}
							onClick={() => setKind("bug")}
						>
							Bug
						</button>
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
						<span className="muted">Details</span>
						<textarea
							rows={4}
							value={details}
							placeholder="What and why, in a few lines"
							onChange={(e) => setDetails(e.target.value)}
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
							disabled={!title.trim() || busy}
						>
							{busy ? "Creating…" : `Create in ${destination(project)}`}
						</button>
					</div>
				</form>
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
