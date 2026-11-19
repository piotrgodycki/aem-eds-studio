import { useEffect, useState } from "react";
import { api, type Project } from "./api.js";
import { Icon } from "./Icon.js";
import { IssueEditor } from "./IssueEditor.js";
import { toBase64 } from "./ProjectView.js";

const MAX_FILES = 5;

/** A selected fragment as the list of requests shows it. */
const short = (text: string) => (text.length > 60 ? `${text.slice(0, 57)}…` : text);

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
	/** What the person has asked the agent to change so far, newest last. */
	const [asks, setAsks] = useState<string[]>([]);
	const [ask, setAsk] = useState("");
	/** The fragment of the agent's text the person selected, for the next request. */
	const [quote, setQuote] = useState("");
	/** Screenshots and files to attach: sent with the first write, then kept by the server. */
	const [files, setFiles] = useState<File[]>([]);
	const [filesId, setFilesId] = useState<string | undefined>();
	const [busy, setBusy] = useState<"" | "writing" | "changing" | "creating">("");
	const [created, setCreated] = useState<Array<{ label: string; url: string }>>([]);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!open || blocks.length) return;
		api.inventory(project.id).then(
			(inv) => setBlocks(inv.blocks.map((b) => b.name)),
			() => setBlocks([]),
		);
	}, [open, blocks.length, project.id]);

	const run = async (what: "writing" | "changing" | "creating", fn: () => Promise<void>) => {
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
	const addFiles = (list: FileList | File[]) =>
		setFiles([...files, ...Array.from(list)].slice(0, MAX_FILES));
	const write = () =>
		run("writing", async () => {
			const w = await api.writeIssue(project.id, {
				kind,
				title,
				details: notes,
				...(block ? { block } : {}),
				files: await Promise.all(
					files.map(async (f) => ({ name: f.name || "pasted.png", data: await toBase64(f) })),
				),
			});
			setFilesId(w.filesId);
			setWritten({ title: w.title, body: w.body });
			setAsks([]);
		});
	const change = () =>
		run("changing", async () => {
			if (!written || !ask.trim()) return;
			const w = await api.writeIssue(project.id, {
				kind,
				title,
				details: notes,
				...(block ? { block } : {}),
				current: written,
				change: quote ? `About this part: "${quote}"\n${ask}` : ask,
				...(filesId ? { filesId } : {}),
			});
			setWritten({ title: w.title, body: w.body });
			setAsks([...asks, quote ? `"${short(quote)}": ${ask.trim()}` : ask.trim()]);
			setAsk("");
			setQuote("");
		});
	const create = () =>
		run("creating", async () => {
			if (!written) return;
			const issue = await api.newIssue(project.id, {
				kind,
				...written,
				...(filesId ? { filesId } : {}),
			});
			setCreated([issue, ...created]);
			setWritten(null);
			setFiles([]);
			setFilesId(undefined);
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
					onPaste={(e) => {
						if (e.clipboardData.files.length) addFiles(e.clipboardData.files);
					}}
					onDragOver={(e) => e.preventDefault()}
					onDrop={(e) => {
						e.preventDefault();
						addFiles(e.dataTransfer.files);
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
					<div className="new-issue-files">
						{files.map((f, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: two pasted images share a name, their place tells them apart
							<span key={`${f.name}-${i}`} className="tag">
								<Icon name="paperclip" size={12} /> {f.name || "pasted image"}
								<button
									type="button"
									className="icon-btn icon-btn-sm"
									aria-label={`Remove ${f.name || "the pasted image"}`}
									onClick={() => setFiles(files.filter((_, j) => j !== i))}
								>
									<Icon name="close" size={10} />
								</button>
							</span>
						))}
						{files.length < MAX_FILES && (
							<label
								className="icon-btn"
								title="Attach screenshots or files"
								aria-label="Attach screenshots or files"
							>
								<Icon name="plus" size={16} />
								<input
									type="file"
									multiple
									hidden
									accept="image/*,.pdf,.txt,.md,.json,.csv,.html,.log"
									onChange={(e) => {
										if (e.target.files) addFiles(e.target.files);
										e.target.value = "";
									}}
								/>
							</label>
						)}
						{!files.length && (
							<span className="muted small">
								Screenshots or files: add, paste or drop them. The agent looks at them too.
							</span>
						)}
					</div>
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
						The agent's text. Edit it here or ask the agent below: nothing is sent until you press
						Create.
					</p>
					<label className="small">
						<span className="muted">Title</span>
						<input
							value={written.title}
							onChange={(e) => setWritten({ ...written, title: e.target.value })}
						/>
					</label>
					{files.length > 0 && (
						<p className="muted small">
							<Icon name="paperclip" size={12} /> {files.length} attached:{" "}
							{files.map((f) => f.name || "pasted image").join(", ")}
						</p>
					)}
					<IssueEditor
						value={written.body}
						onChange={(body) => setWritten({ ...written, body })}
						onSelect={setQuote}
					/>
					{asks.length > 0 && (
						<ul className="new-issue-asks muted small">
							{asks.map((a, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: the same request may be asked twice
								<li key={i}>You asked: {a}</li>
							))}
						</ul>
					)}
					{quote && (
						<p className="new-issue-quote small">
							<span className="muted">About:</span> “{quote}”
							<button
								type="button"
								className="icon-btn icon-btn-sm"
								aria-label="Forget the selected part"
								onClick={() => setQuote("")}
							>
								<Icon name="close" size={10} />
							</button>
						</p>
					)}
					<form
						className="new-issue-ask"
						onSubmit={(e) => {
							e.preventDefault();
							void change();
						}}
					>
						<input
							aria-label="Ask the agent to change it"
							placeholder={
								quote
									? "What to change in the selected part"
									: "Ask the agent to change it, or select a sentence first"
							}
							value={ask}
							onChange={(e) => setAsk(e.target.value)}
						/>
						<button
							type="submit"
							className="icon-btn"
							aria-label={busy === "changing" ? "The agent is changing it" : "Send to the agent"}
							title="Send to the agent"
							disabled={!ask.trim() || busy !== ""}
						>
							<Icon name={busy === "changing" ? "history" : "send"} size={16} />
						</button>
					</form>
					<div className="row">
						<button type="button" className="btn btn-ghost btn-sm" onClick={() => setWritten(null)}>
							<Icon name="back" size={14} /> Back to the notes
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
