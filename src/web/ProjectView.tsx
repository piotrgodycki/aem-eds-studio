import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Agents, isLive, useProjectJobs } from "./Agents.js";
import {
	api,
	type Draft,
	type Job,
	type ModelChoice,
	type Project,
	type SourceChoice,
	type Ticket,
	useRole,
} from "./api.js";
import { BlockAnalytics } from "./BlockAnalytics.js";
import { Board } from "./Board.js";
import { ChatView } from "./ChatView.js";
import { confirmAction } from "./Confirm.js";
import { Icon } from "./Icon.js";
import { JobLog } from "./JobLog.js";
import { AGENTS, ModelPicker, useDefaultAgent } from "./ModelPicker.js";
import { Overview } from "./Overview.js";
import { useOnComputer } from "./Pairing.js";
import { href, type ProjectTab } from "./router.js";
import { providerOf, SourcePicker } from "./SourcePicker.js";
import { TicketField, usesTickets } from "./TicketField.js";
import { useOutside } from "./useOutside.js";

export function ProjectView(props: { id: string; tab: ProjectTab; thread?: string; job?: string }) {
	const onComputer = useOnComputer();
	const role = useRole(props.id);
	const [project, setProject] = useState<Project | null>(null);
	const [drafts, setDrafts] = useState<Draft[] | null>(null);
	const [error, setError] = useState("");
	const [job, setJob] = useState<Job | null>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const jobs = useProjectJobs(props.id);
	const working = jobs?.filter(isLive).length ?? 0;
	const tab = props.tab;

	const loadDrafts = useCallback(
		() => api.drafts(props.id).then(setDrafts, (e: Error) => setError(e.message)),
		[props.id],
	);
	useEffect(() => {
		api.project(props.id).then(setProject, (e: Error) => setError(e.message));
		void loadDrafts();
	}, [props.id, loadDrafts]);

	if (error && !project)
		return (
			<main className="page">
				<p className="error">{error}</p>
			</main>
		);
	if (!project)
		return (
			<main className="page">
				<p className="muted">Loading…</p>
			</main>
		);

	const open = drafts?.filter((d) => d.status !== "accepted") ?? [];
	const accepted = drafts?.filter((d) => d.status === "accepted") ?? [];

	return (
		<main className="page">
			{/* The header and tabs stay at the top while the page scrolls. */}
			<div className="project-top">
				{/* One compact line: the name and what matters about it, settings at the right. */}
				<div className="page-head project-head">
					<h1 className="project-title">
						<Icon name={project.source.type === "github" ? "github" : "folder"} size={18} />
						{project.name}
					</h1>
					<ProjectMeta project={project} role={role} />
					{onComputer && (
						<button
							type="button"
							className="btn btn-outline btn-sm push-right"
							onClick={() => setSettingsOpen(true)}
						>
							<Icon name="settings" size={14} /> Project settings
						</button>
					)}
				</div>
				{settingsOpen && (
					<ProjectSettings
						project={project}
						onSaved={setProject}
						onClose={() => setSettingsOpen(false)}
					/>
				)}

				<nav className="tabs page-tabs" aria-label="Project">
					<a
						href={href.project(project.id)}
						className={tab === "chat" ? "on" : ""}
						aria-current={tab === "chat" ? "page" : undefined}
					>
						<Icon name="chat" /> Chat
					</a>
					<a
						href={href.overview(project.id)}
						className={tab === "overview" ? "on" : ""}
						aria-current={tab === "overview" ? "page" : undefined}
					>
						<Icon name="folder" /> Overview
					</a>
					<a
						href={href.blocks(project.id)}
						className={tab === "blocks" ? "on" : ""}
						aria-current={tab === "blocks" ? "page" : undefined}
					>
						<Icon name="design" /> Blocks
					</a>
					<a
						href={href.drafts(project.id)}
						className={tab === "drafts" ? "on" : ""}
						aria-current={tab === "drafts" ? "page" : undefined}
					>
						<Icon name="desktop" /> Drafts
						{open.length > 0 && <span className="count">{open.length}</span>}
					</a>
					<a
						href={href.board(project.id)}
						className={tab === "board" ? "on" : ""}
						aria-current={tab === "board" ? "page" : undefined}
					>
						<Icon name="github" /> Work board
					</a>
					<a
						href={href.agents(project.id)}
						className={tab === "agents" ? "on" : ""}
						aria-current={tab === "agents" ? "page" : undefined}
					>
						<Icon name="agent" /> Agents
						{working > 0 && (
							<span className="count count-live">
								<span className="dot dot-running" /> {working}
							</span>
						)}
					</a>
				</nav>
			</div>

			{tab === "chat" && (
				<ChatView key={props.thread ?? "new"} project={project} threadId={props.thread} />
			)}
			{tab === "overview" && <Overview project={project} />}
			{tab === "board" && <Board projectId={project.id} />}
			{tab === "agents" && <Agents projectId={project.id} jobs={jobs} job={props.job} />}

			{tab === "blocks" && (
				<section className="panel">
					<span className="eyebrow">
						<Icon name="design" size={13} /> New block from a design
					</span>
					<NewDraft project={project} onStarted={setJob} />
					{job && (
						<JobLog
							job={job}
							title="New draft"
							onEnd={(_ended, events) => {
								void loadDrafts();
								const d = events.find((e) => e.type === "draft");
								if (d) location.hash = href.draft(project.id, String(d.name));
							}}
						/>
					)}
				</section>
			)}
			{tab === "blocks" && <ProjectBlocks project={project} drafts={drafts} />}

			{tab === "drafts" && (
				<section className="drafts-panel">
					{!drafts && <p className="muted">Loading…</p>}
					{drafts && open.length === 0 && (
						<p className="drafts-empty muted small">
							Nothing to review yet. A block you generate or change lands here as a draft: the
							repository changes only when someone accepts it.
						</p>
					)}
					<ul className="draft-list">
						{open.map((d) => (
							<DraftRow
								key={d.name}
								project={project}
								draft={d}
								onDiscarded={onComputer ? () => void loadDrafts() : undefined}
							/>
						))}
					</ul>
					{accepted.length > 0 && (
						<details className="accepted">
							<summary className="muted small">Accepted ({accepted.length})</summary>
							<ul className="draft-list">
								{accepted.map((d) => (
									<DraftRow key={d.name} project={project} draft={d} />
								))}
							</ul>
						</details>
					)}
				</section>
			)}
		</main>
	);
}

/** Beside the title: a link to the repository, the path behind a button, your role and the agent that answers. */
function ProjectMeta(props: { project: Project; role: ReturnType<typeof useRole> }) {
	const { project, role } = props;
	const agent = useDefaultAgent(project.model?.agent);
	const info = AGENTS.find((a) => a.id === agent.id);
	const model = project.model?.model;
	const modelLabel = info?.models?.find((m) => m.id === model)?.label ?? model;
	return (
		<div className="project-meta small">
			{project.source.type === "github" && (
				<a
					className="icon-btn"
					href={`https://github.com/${project.source.repo}`}
					target="_blank"
					rel="noreferrer"
					aria-label={`Open ${project.source.repo} on GitHub`}
					title={`Open ${project.source.repo} on GitHub`}
				>
					<Icon name="external" size={14} />
				</a>
			)}
			<PathButton path={project.path} />
			{role && (
				<span
					className={`role-pill role-${role}`}
					title={
						role === "developer"
							? "You can accept drafts into this repository"
							: "You create and review; a developer accepts"
					}
				>
					{role === "developer" ? "Developer" : "Contributor"}
				</span>
			)}
			<span className="muted" title="The agent that answers unless a thread picks another">
				<Icon name="agent" size={14} /> {agent.label ?? (agent.loading ? "…" : "No agent")}
				{modelLabel ? ` · ${modelLabel}` : ""}
			</span>
		</div>
	);
}

/** The workspace path, hidden until asked for, with Copy. */
function PathButton(props: { path: string }) {
	const [open, setOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const box = useRef<HTMLSpanElement>(null);
	const close = useCallback(() => setOpen(false), []);
	useOutside(box, open, close);
	const copy = async () => {
		await navigator.clipboard?.writeText(props.path);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};
	return (
		<span className="path-btn" ref={box}>
			<button
				type="button"
				className="icon-btn"
				aria-expanded={open}
				aria-label="Workspace path"
				title="Where the project is on this computer"
				onClick={() => setOpen(!open)}
			>
				<Icon name="desktop" size={14} />
			</button>
			{open && (
				<span className="path-pop" role="dialog" aria-label="Workspace path">
					<code>{props.path}</code>
					<button type="button" className="btn btn-outline btn-sm" onClick={() => void copy()}>
						<Icon name={copied ? "check" : "copy"} size={13} /> {copied ? "Copied" : "Copy"}
					</button>
				</span>
			)}
		</span>
	);
}

/** Under the New block form: the blocks already in blocks/, and whether a draft of one waits. */
function ProjectBlocks(props: { project: Project; drafts: Draft[] | null }) {
	const { project } = props;
	const [blocks, setBlocks] = useState<string[] | null>(null);
	const [tracking, setTracking] = useState<string | null>(null);
	useEffect(() => {
		api.blocks(project.id).then(setBlocks, () => setBlocks([]));
	}, [project.id]);
	return (
		<section className="project-blocks">
			<span className="eyebrow">
				In blocks/{blocks && blocks.length > 0 && <span className="count">{blocks.length}</span>}
			</span>
			{!blocks && <p className="muted small">Loading…</p>}
			{blocks?.length === 0 && (
				<p className="muted small">No blocks yet. The first one you accept lands here.</p>
			)}
			<ul className="list-rows">
				{blocks?.map((name) => {
					const draft = props.drafts?.find((d) => d.name === name && d.status === "open");
					return (
						<li key={name}>
							<Icon name="design" size={14} />
							<strong className="mono">{name}</strong>
							<span className="muted small">blocks/{name}/</span>
							{draft && (
								<a className="push-right small" href={href.draft(project.id, name)}>
									Draft v{draft.versions.at(-1)?.version} waits for review
								</a>
							)}
							<button
								type="button"
								className={`btn btn-ghost btn-sm${draft ? "" : " push-right"}`}
								onClick={() => setTracking(name)}
							>
								<Icon name="usage" size={13} /> Analytics
							</button>
						</li>
					);
				})}
			</ul>
			{tracking && (
				<BlockAnalytics project={project} block={tracking} onClose={() => setTracking(null)} />
			)}
		</section>
	);
}

function DraftRow(props: { project: Project; draft: Draft; onDiscarded?: () => void }) {
	const { draft } = props;
	const last = draft.versions.at(-1);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	return (
		<li className="draft-row">
			<a href={href.draft(props.project.id, draft.name)}>
				<strong className="mono">{draft.name}</strong>
				<span className="muted small draft-versions">
					{draft.status === "accepted"
						? `accepted v${draft.accepted?.version}${draft.accepted?.commit ? ` · ${draft.accepted.commit}` : ""}`
						: `v${last?.version ?? 1} · ${draft.versions.length} version${draft.versions.length === 1 ? "" : "s"}`}
				</span>
				{last?.feedback && <span className="muted small draft-feedback">“{last.feedback}”</span>}
				{last && !last.ok && <span className="tag warn">issues</span>}
				{!!draft.behind && (
					<span className="tag" title={`${draft.branch} is behind the default branch`}>
						{draft.behind} behind main
					</span>
				)}
			</a>
			{props.onDiscarded && (
				<button
					type="button"
					className="icon-btn draft-delete"
					aria-label={`Delete the draft ${draft.name}`}
					title="Delete draft"
					disabled={busy}
					onClick={async () => {
						const ok = await confirmAction({
							title: "Delete this draft?",
							item: draft.name,
							detail: "The draft and all its versions go. The repository doesn't change.",
							action: "Delete draft",
						});
						if (!ok) return;
						setBusy(true);
						setError("");
						try {
							await api.discard(props.project.id, draft.name);
							props.onDiscarded?.();
						} catch (e) {
							setError((e as Error).message);
							setBusy(false);
						}
					}}
				>
					<Icon name="trash" />
				</button>
			)}
			{error && <p className="error small">{error}</p>}
		</li>
	);
}

/** A file as base64, to send it inside the JSON request. */
export async function toBase64(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

/** The New block form; the chat opens it too, filled in from what the agent proposed. */
export function NewDraft(props: {
	project: Project;
	onStarted: (job: Job) => void;
	initial?: { design?: string; name?: string };
}) {
	const [design, setDesign] = useState(props.initial?.design ?? "");
	const [name, setName] = useState(props.initial?.name ?? "");
	const [model, setModel] = useState<ModelChoice>({});
	const [source, setSource] = useState<SourceChoice>({});
	const [exportFile, setExportFile] = useState<File | null>(null);
	const [ticket, setTicket] = useState<Ticket>({ type: "feature", number: "" });
	const tickets = usesTickets(props.project);
	const [figmaToken, setFigmaToken] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		api.status().then(
			(s) => setFigmaToken(!!s.figma?.token),
			() => {},
		);
	}, []);

	const submit = async (useSample = false) => {
		setBusy(true);
		setError("");
		try {
			const read = providerOf(design) === "figma" ? source.read : undefined;
			if (!useSample && read === "export" && !exportFile)
				throw new Error("Choose the PNG or SVG you exported from Figma.");
			props.onStarted(
				await api.newDraft(props.project.id, {
					design: useSample ? "sample" : design.trim(),
					export:
						!useSample && read === "export" && exportFile
							? { name: exportFile.name, data: await toBase64(exportFile) }
							: undefined,
					name: name.trim() || (useSample ? "hero" : ""),
					source: useSample
						? undefined
						: providerOf(design) === "figma"
							? { ...source, read: source.read ?? (figmaToken ? "rest" : "mcp") }
							: source,
					...(tickets ? { ticket } : {}),
					...model,
				}),
			);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<form
			className="stack"
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<label className="field">
				<span>Design link</span>
				<input
					type="url"
					placeholder="Link to a block, section or component"
					value={design}
					onChange={(e) => {
						if (providerOf(e.target.value) !== providerOf(design)) setSource({});
						setDesign(e.target.value);
					}}
				/>
			</label>
			<SourcePicker
				link={design}
				value={source}
				onChange={setSource}
				figmaToken={figmaToken}
				onExportFile={setExportFile}
			/>
			<div className="draft-fields">
				<label className="field">
					<span>Block name</span>
					<input
						className="mono"
						placeholder="hero"
						value={name}
						onChange={(e) => setName(e.target.value.toLowerCase())}
					/>
				</label>
				<ModelPicker value={model} onChange={setModel} projectAgent={props.project.model?.agent} />
			</div>
			{tickets && props.project.ticketKey && (
				<div className="field">
					<span>Ticket</span>
					<TicketField ticketKey={props.project.ticketKey} value={ticket} onChange={setTicket} />
				</div>
			)}
			<div className="row">
				<button
					type="submit"
					className="btn btn-accent"
					disabled={busy || !design.trim() || !name.trim() || (tickets && !ticket.number)}
				>
					<Icon name="sparkle" /> Generate draft
				</button>
				<button
					type="button"
					className="btn btn-ghost"
					disabled={busy || (tickets && !ticket.number)}
					onClick={() => submit(true)}
				>
					or try the sample design
				</button>
			</div>
			{error && <p className="error">{error}</p>}
		</form>
	);
}

/** The team's ticket key: with one, drafts start on feature/<KEY>-<n> or bug/<KEY>-<n>. */
function TicketKeySetting(props: { project: Project; onSaved: (p: Project) => void }) {
	const [key, setKey] = useState(props.project.ticketKey ?? "");
	const [error, setError] = useState("");
	const changed = key !== (props.project.ticketKey ?? "");
	return (
		<section className="settings-section">
			<h3>Ticket branches</h3>
			<p className="muted small">
				Your tickets' key, e.g. CURLY: each draft then asks for its ticket and goes on
				feature/CURLY-111 or bug/CURLY-111. Empty: drafts go on draft/&lt;name&gt;.
			</p>
			<form
				className="row"
				onSubmit={async (e) => {
					e.preventDefault();
					setError("");
					try {
						props.onSaved(await api.setTicketKey(props.project.id, key));
					} catch (err) {
						setError((err as Error).message);
					}
				}}
			>
				<input
					className="mono port-input"
					aria-label="Ticket key"
					placeholder="CURLY"
					value={key}
					onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
				/>
				<button type="submit" className="btn btn-outline btn-sm" disabled={!changed}>
					Save
				</button>
			</form>
			{error && <p className="error small">{error}</p>}
		</section>
	);
}

/** The project's settings in a dialog: its default agent and model, sharing, removing it. */
function ProjectSettings(props: {
	project: Project;
	onSaved: (p: Project) => void;
	onClose: () => void;
}) {
	const { onClose } = props;
	const [model, setModel] = useState<ModelChoice>(props.project.model ?? {});
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const exportSettings = async () => {
		const settings = await api.exportSettings(props.project.id);
		const blob = new Blob([`${JSON.stringify(settings, null, 2)}\n`], {
			type: "application/json",
		});
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `${props.project.name.replace(/[^a-z0-9._-]+/gi, "-")}.studio.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	};
	const remove = async () => {
		const ok = await confirmAction({
			title: "Remove this project?",
			item: props.project.name,
			detail: "The studio forgets it. Its folder and repository stay as they are.",
			action: "Remove project",
			icon: "folder",
		});
		if (!ok) return;
		try {
			await api.removeProject(props.project.id);
			location.hash = href.projects();
		} catch (e) {
			setError((e as Error).message);
		}
	};

	return createPortal(
		<div className="dialog-backdrop">
			<dialog
				open
				className="dialog panel settings"
				aria-modal="true"
				aria-labelledby="project-settings-title"
			>
				<span className="eyebrow">
					<Icon name="settings" size={13} /> Project settings
				</span>
				<h2 id="project-settings-title">{props.project.name}</h2>
				<section className="settings-section">
					<h3>Default agent</h3>
					<p className="muted small">Used for every job in this project; a job can pick another.</p>
					<ModelPicker
						value={model}
						onChange={(m) => {
							setModel(m);
							setSaved(false);
						}}
					/>
					<div className="row">
						<button
							type="button"
							className="btn btn-outline btn-sm"
							onClick={() =>
								api.setModel(props.project.id, model).then(
									(p) => {
										props.onSaved(p);
										setSaved(true);
									},
									(e: Error) => setError(e.message),
								)
							}
						>
							Save
						</button>
						{saved && <span className="muted small">Saved.</span>}
					</div>
				</section>
				<TicketKeySetting project={props.project} onSaved={props.onSaved} />
				<section className="settings-section">
					<h3>Share</h3>
					<p className="muted small">
						The project's settings as a file a teammate can import. It holds no secrets.
					</p>
					<button type="button" className="btn btn-outline btn-sm" onClick={exportSettings}>
						Export settings
					</button>
				</section>
				<section className="settings-section">
					<h3>Remove</h3>
					<p className="muted small">
						Takes the project out of the studio. Its folder and repository stay as they are.
					</p>
					<button type="button" className="btn btn-ghost btn-danger btn-sm" onClick={remove}>
						Remove from studio
					</button>
				</section>
				{error && <p className="error">{error}</p>}
				<div className="row setup-foot">
					<button type="button" className="btn btn-accent push-right" onClick={onClose}>
						Done
					</button>
				</div>
			</dialog>
		</div>,
		document.body,
	);
}
