import { useCallback, useEffect, useState } from "react";
import {
	api,
	type Draft,
	type Job,
	type ModelChoice,
	type Project,
	type SourceChoice,
} from "./api.js";
import { Board } from "./Board.js";
import { Icon } from "./Icon.js";
import { JobLog } from "./JobLog.js";
import { ModelPicker } from "./ModelPicker.js";
import { href } from "./router.js";
import { providerOf, SourcePicker } from "./SourcePicker.js";

export function ProjectView(props: { id: string; tab: "blocks" | "board" }) {
	const [project, setProject] = useState<Project | null>(null);
	const [drafts, setDrafts] = useState<Draft[] | null>(null);
	const [error, setError] = useState("");
	const [job, setJob] = useState<Job | null>(null);
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
			<div className="page-head">
				<div>
					<h1>{project.name}</h1>
					<p className="muted mono small">{project.path}</p>
				</div>
			</div>

			<nav className="tabs page-tabs" aria-label="Project">
				<a
					href={href.project(project.id)}
					className={tab === "blocks" ? "on" : ""}
					aria-current={tab === "blocks" ? "page" : undefined}
				>
					<Icon name="design" /> Blocks
				</a>
				<a
					href={href.board(project.id)}
					className={tab === "board" ? "on" : ""}
					aria-current={tab === "board" ? "page" : undefined}
				>
					<Icon name="github" /> Work board
				</a>
			</nav>

			{tab === "board" && <Board projectId={project.id} />}

			{tab === "blocks" && (
				<>
					<div className="grid-2">
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

						<section className="panel">
							<span className="eyebrow">Drafts</span>
							{!drafts && <p className="muted">Loading…</p>}
							{drafts && open.length === 0 && (
								<p className="muted">No drafts waiting for review. Generate one from a design.</p>
							)}
							<ul className="draft-list">
								{open.map((d) => (
									<DraftRow
										key={d.name}
										project={project}
										draft={d}
										onDiscarded={() => void loadDrafts()}
									/>
								))}
							</ul>
							{accepted.length > 0 && (
								<>
									<span className="eyebrow eyebrow-sub">Accepted</span>
									<ul className="draft-list">
										{accepted.map((d) => (
											<DraftRow key={d.name} project={project} draft={d} />
										))}
									</ul>
								</>
							)}
						</section>
					</div>

					<ProjectSettings project={project} onSaved={setProject} />
				</>
			)}
		</main>
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
				<span className="muted small">
					{draft.status === "accepted"
						? `accepted v${draft.accepted?.version}${draft.accepted?.commit ? ` · ${draft.accepted.commit}` : ""}`
						: `${draft.versions.length} version${draft.versions.length === 1 ? "" : "s"}`}
					{last?.feedback ? ` · “${last.feedback}”` : ""}
				</span>
				{last && !last.ok && <span className="tag warn">issues</span>}
			</a>
			{props.onDiscarded && (
				<button
					type="button"
					className="icon-btn draft-delete"
					aria-label={`Delete the draft ${draft.name}`}
					title="Delete draft"
					disabled={busy}
					onClick={async () => {
						if (
							!confirm(
								`Delete the draft “${draft.name}” and all its versions? The repository is not changed.`,
							)
						)
							return;
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
async function toBase64(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

function NewDraft(props: { project: Project; onStarted: (job: Job) => void }) {
	const [design, setDesign] = useState("");
	const [name, setName] = useState("");
	const [model, setModel] = useState<ModelChoice>({});
	const [source, setSource] = useState<SourceChoice>({});
	const [exportFile, setExportFile] = useState<File | null>(null);
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
			<label className="field">
				<span>Block name</span>
				<input
					className="mono"
					placeholder="hero"
					value={name}
					onChange={(e) => setName(e.target.value.toLowerCase())}
				/>
			</label>
			<ModelPicker
				value={model}
				onChange={setModel}
				defaultLabel={
					props.project.model?.agent ? `Project default (${props.project.model.agent})` : undefined
				}
			/>
			<div className="row">
				<button
					type="submit"
					className="btn btn-accent"
					disabled={busy || !design.trim() || !name.trim()}
				>
					<Icon name="sparkle" /> Generate draft
				</button>
				<button
					type="button"
					className="btn btn-outline"
					disabled={busy}
					onClick={() => submit(true)}
				>
					Try the sample design
				</button>
			</div>
			<p className="muted small">A draft: the repo changes only when someone accepts it.</p>
			{error && <p className="error">{error}</p>}
		</form>
	);
}

function ProjectSettings(props: { project: Project; onSaved: (p: Project) => void }) {
	const [model, setModel] = useState<ModelChoice>(props.project.model ?? {});
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");
	return (
		<section className="panel">
			<span className="eyebrow">Project settings</span>
			<p className="muted small">
				The default agent and model for this project; a job can override it.
			</p>
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
					className="btn btn-outline"
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
				<button
					type="button"
					className="btn btn-outline"
					title="Download this project's settings (no secrets) to share or import elsewhere"
					onClick={async () => {
						const settings = await api.exportSettings(props.project.id);
						const blob = new Blob([`${JSON.stringify(settings, null, 2)}\n`], {
							type: "application/json",
						});
						const a = document.createElement("a");
						a.href = URL.createObjectURL(blob);
						a.download = `${props.project.name.replace(/[^a-z0-9._-]+/gi, "-")}.studio.json`;
						a.click();
						URL.revokeObjectURL(a.href);
					}}
				>
					Export settings
				</button>
				<button
					type="button"
					className="btn btn-ghost btn-danger push-right"
					onClick={async () => {
						if (!confirm(`Remove ${props.project.name} from the studio? Its folder stays on disk.`))
							return;
						try {
							await api.removeProject(props.project.id);
							location.hash = href.projects();
						} catch (e) {
							setError((e as Error).message);
						}
					}}
				>
					Remove from studio
				</button>
			</div>
			{error && <p className="error">{error}</p>}
		</section>
	);
}
