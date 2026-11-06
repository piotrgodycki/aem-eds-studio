import { useCallback, useEffect, useState } from "react";
import { JobLog } from "./JobLog.js";
import { ModelPicker } from "./ModelPicker.js";
import { type Draft, type Job, type ModelChoice, type Project, api } from "./api.js";
import { href } from "./router.js";

export function ProjectView(props: { id: string }) {
	const [project, setProject] = useState<Project | null>(null);
	const [drafts, setDrafts] = useState<Draft[] | null>(null);
	const [error, setError] = useState("");
	const [job, setJob] = useState<Job | null>(null);

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
			<a className="back" href={href.projects()}>
				← Projects
			</a>
			<div className="page-head">
				<div>
					<h1>{project.name}</h1>
					<p className="muted mono small">{project.path}</p>
				</div>
			</div>

			<div className="grid-2">
				<section className="panel">
					<h2>New block from a design</h2>
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
					<h2>Drafts</h2>
					{!drafts && <p className="muted">Loading…</p>}
					{drafts && open.length === 0 && (
						<p className="muted">No drafts waiting for review. Generate one from a design.</p>
					)}
					<ul className="draft-list">
						{open.map((d) => (
							<DraftRow key={d.name} project={project} draft={d} />
						))}
					</ul>
					{accepted.length > 0 && (
						<>
							<h3>Accepted</h3>
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
		</main>
	);
}

function DraftRow(props: { project: Project; draft: Draft }) {
	const { draft } = props;
	const last = draft.versions.at(-1);
	return (
		<li>
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
		</li>
	);
}

function NewDraft(props: { project: Project; onStarted: (job: Job) => void }) {
	const [design, setDesign] = useState("");
	const [name, setName] = useState("");
	const [model, setModel] = useState<ModelChoice>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	const submit = async (useSample = false) => {
		setBusy(true);
		setError("");
		try {
			props.onStarted(
				await api.newDraft(props.project.id, {
					design: useSample ? "sample" : design.trim(),
					name: name.trim() || (useSample ? "hero" : ""),
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
					placeholder="https://www.figma.com/design/…?node-id=…  ·  Framer, Stitch or any page"
					value={design}
					onChange={(e) => setDesign(e.target.value)}
				/>
			</label>
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
					className="btn primary"
					disabled={busy || !design.trim() || !name.trim()}
				>
					Generate draft
				</button>
				<button type="button" className="btn ghost" disabled={busy} onClick={() => submit(true)}>
					Try the sample design
				</button>
			</div>
			<p className="muted small">
				The result is a draft: the repository changes only when someone accepts it.
			</p>
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
			<h2>Project settings</h2>
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
					className="btn"
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
					className="btn ghost danger push-right"
					onClick={async () => {
						if (!confirm(`Remove ${props.project.name} from the studio? Its folder stays on disk.`))
							return;
						await api.removeProject(props.project.id);
						location.hash = href.projects();
					}}
				>
					Remove from studio
				</button>
			</div>
			{error && <p className="error">{error}</p>}
		</section>
	);
}
