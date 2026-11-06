import { useCallback, useEffect, useState } from "react";
import { JobLog } from "./JobLog.js";
import { ModelPicker } from "./ModelPicker.js";
import { type Draft, type Job, type ModelChoice, api } from "./api.js";
import { href } from "./router.js";

const when = (iso: string) =>
	new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function DraftView(props: { id: string; name: string }) {
	const { id, name } = props;
	const [draft, setDraft] = useState<Draft | null | undefined>(undefined);
	const [selected, setSelected] = useState<number | null>(null);
	const [preview, setPreview] = useState<{ url: string; version?: number } | null>(null);
	const [previewError, setPreviewError] = useState("");
	const [job, setJob] = useState<Job | null>(null);
	const [running, setRunning] = useState(false);
	const [error, setError] = useState("");

	const load = useCallback(
		async (select?: number) => {
			try {
				const d = (await api.drafts(id)).find((x) => x.name === name) ?? null;
				setDraft(d);
				if (d) setSelected(select ?? d.accepted?.version ?? d.versions.at(-1)?.version ?? null);
			} catch (e) {
				setError((e as Error).message);
			}
		},
		[id, name],
	);
	useEffect(() => {
		void load();
	}, [load]);

	// (Re)start the preview server for the selected version.
	useEffect(() => {
		if (selected === null) return;
		let live = true;
		setPreview(null);
		setPreviewError("");
		api.preview(id, name, selected).then(
			(p) => live && setPreview(p),
			(e: Error) => live && setPreviewError(e.message),
		);
		return () => {
			live = false;
		};
	}, [id, name, selected]);

	if (draft === undefined)
		return (
			<main className="page">
				<p className="muted">Loading…</p>
			</main>
		);
	if (draft === null)
		return (
			<main className="page">
				<a className="back" href={href.project(id)}>
					← Project
				</a>
				<p>There's no draft “{name}” (it may have been discarded).</p>
			</main>
		);

	const accepted = draft.status === "accepted";
	const current = draft.versions.find((v) => v.version === selected);

	return (
		<main className="page">
			<a className="back" href={href.project(id)}>
				← Project
			</a>
			<div className="page-head">
				<div>
					<h1 className="mono">{draft.name}</h1>
					<p className="muted small">
						{draft.source.designRef ? (
							<>
								From{" "}
								<a href={draft.source.designRef} target="_blank" rel="noreferrer">
									{draft.source.designRef}
								</a>
							</>
						) : (
							"From a local design"
						)}
						{draft.source.agent
							? ` · ${draft.source.agent}${draft.source.model ? ` (${draft.source.model})` : ""}`
							: ""}
					</p>
				</div>
				<span className={`status-pill ${accepted ? "ok" : ""}`}>
					{accepted ? `Accepted v${draft.accepted?.version}` : "In review"}
				</span>
			</div>
			{error && <p className="error">{error}</p>}

			<div className="review">
				<aside className="panel versions">
					<h2>Versions</h2>
					<ol>
						{draft.versions.map((v) => (
							<li key={v.version}>
								<button
									type="button"
									className={v.version === selected ? "on" : ""}
									onClick={() => setSelected(v.version)}
								>
									<span className="mono">v{v.version}</span>
									<span className="v-note">{v.feedback ? `“${v.feedback}”` : "First version"}</span>
									<span className="muted small">
										{when(v.createdAt)}
										{!v.ok && " · checks found issues"}
										{draft.accepted?.version === v.version && " · accepted"}
									</span>
								</button>
							</li>
						))}
					</ol>
				</aside>

				<section className="panel preview">
					<div className="preview-head">
						<strong>Preview {selected ? `v${selected}` : ""}</strong>
						{preview && (
							<a href={preview.url} target="_blank" rel="noreferrer" className="small">
								Open in a new tab ↗
							</a>
						)}
					</div>
					{previewError && <p className="error">{previewError}</p>}
					{!preview && !previewError && (
						<div className="preview-wait muted">Starting the preview…</div>
					)}
					{preview && <iframe title={`${draft.name} v${selected}`} src={preview.url} />}
					{current && current.files.length > 0 && (
						<p className="muted small mono">{current.files.join(" · ")}</p>
					)}
				</section>
			</div>

			{accepted && draft.accepted && (
				<section className="panel accepted">
					<h2>Accepted v{draft.accepted.version}</h2>
					<p className="muted">
						In <code>blocks/{draft.name}/</code>
						{draft.accepted.commit ? (
							<>
								{" "}
								· commit <code>{draft.accepted.commit}</code>, with the review rounds in the message
							</>
						) : (
							", not committed yet"
						)}{" "}
						· {when(draft.accepted.at)}
					</p>
				</section>
			)}
			{!accepted && (
				<div className="grid-2">
					<Refine
						id={id}
						name={name}
						from={selected ?? undefined}
						busy={running}
						onStarted={(j) => {
							setJob(j);
							setRunning(true);
						}}
					/>
					<Accept
						id={id}
						name={name}
						version={selected ?? undefined}
						onAccepted={() => load()}
						onDiscarded={() => {
							location.hash = href.project(id);
						}}
					/>
				</div>
			)}
			{job && (
				<JobLog
					job={job}
					title={`Change on v${selected ?? ""}`}
					onEnd={(_j, events) => {
						setRunning(false);
						const d = events.find((e) => e.type === "draft");
						void load(d ? Number(d.version) : undefined);
					}}
				/>
			)}
		</main>
	);
}

function Refine(props: {
	id: string;
	name: string;
	from?: number;
	busy: boolean;
	onStarted: (job: Job) => void;
}) {
	const [feedback, setFeedback] = useState("");
	const [model, setModel] = useState<ModelChoice>({});
	const [error, setError] = useState("");
	return (
		<section className="panel">
			<h2>Request changes</h2>
			<p className="muted small">
				Say what to change; the agent makes the next version from v{props.from}.
			</p>
			<form
				className="stack"
				onSubmit={async (e) => {
					e.preventDefault();
					setError("");
					try {
						props.onStarted(
							await api.refine(props.id, props.name, { feedback, version: props.from, ...model }),
						);
						setFeedback("");
					} catch (err) {
						setError((err as Error).message);
					}
				}}
			>
				<textarea
					rows={4}
					placeholder="e.g. bigger headline, orange buttons, less space under the image"
					value={feedback}
					onChange={(e) => setFeedback(e.target.value)}
				/>
				<ModelPicker value={model} onChange={setModel} defaultLabel="Same as the draft" />
				<button type="submit" className="btn primary" disabled={props.busy || !feedback.trim()}>
					{props.busy ? "Working…" : "Make the next version"}
				</button>
				{error && <p className="error">{error}</p>}
			</form>
		</section>
	);
}

function Accept(props: {
	id: string;
	name: string;
	version?: number;
	onAccepted: () => void;
	onDiscarded: () => void;
}) {
	const [branch, setBranch] = useState(`feature/${props.name}`);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState("");
	const [error, setError] = useState("");
	return (
		<section className="panel">
			<h2>Accept</h2>
			<p className="muted small">
				Copies v{props.version} into <code>blocks/{props.name}/</code> and commits only that folder
				on the branch, with the review rounds in the message.
			</p>
			<div className="stack">
				<label className="field">
					<span>Branch</span>
					<input className="mono" value={branch} onChange={(e) => setBranch(e.target.value)} />
				</label>
				<div className="row">
					<button
						type="button"
						className="btn primary"
						disabled={busy || !branch.trim()}
						onClick={async () => {
							setBusy(true);
							setError("");
							try {
								const r = await api.accept(props.id, props.name, {
									version: props.version,
									branch: branch.trim(),
								});
								if (!r.ok && r.error) setError(r.error);
								setResult(
									`Accepted v${r.version}${r.commit ? ` · commit ${r.commit} on ${r.branch}` : ""}`,
								);
								props.onAccepted();
							} catch (e) {
								setError((e as Error).message);
							} finally {
								setBusy(false);
							}
						}}
					>
						{busy ? "Accepting…" : `Accept v${props.version ?? ""}`}
					</button>
					<button
						type="button"
						className="btn ghost danger push-right"
						disabled={busy}
						onClick={async () => {
							if (
								!confirm(
									`Discard the draft “${props.name}” and all its versions? The repository is not changed.`,
								)
							)
								return;
							try {
								await api.discard(props.id, props.name);
								props.onDiscarded();
							} catch (e) {
								setError((e as Error).message);
							}
						}}
					>
						Discard draft
					</button>
				</div>
				{result && <p className="ok-text">{result}</p>}
				{error && <p className="error">{error}</p>}
			</div>
		</section>
	);
}
