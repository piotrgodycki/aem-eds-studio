import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.js";
import { JobLog } from "./JobLog.js";
import { ModelPicker } from "./ModelPicker.js";
import { type Draft, type Job, type ModelChoice, api } from "./api.js";
import { href } from "./router.js";

const when = (iso: string) =>
	new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * A draft under review. The preview gets the window, like the page would in a
 * browser; the review (versions, changes, accept, the job log) sits in a side
 * panel that can be hidden, and Full screen gives the preview the whole screen.
 */
export function DraftView(props: { id: string; name: string }) {
	const { id, name } = props;
	const [draft, setDraft] = useState<Draft | null | undefined>(undefined);
	const [selected, setSelected] = useState<number | null>(null);
	const [preview, setPreview] = useState<{ url: string; version?: number } | null>(null);
	const [previewError, setPreviewError] = useState("");
	const [job, setJob] = useState<Job | null>(null);
	const [running, setRunning] = useState(false);
	const [panel, setPanel] = useState(true);
	const [full, setFull] = useState(false);
	const [error, setError] = useState("");
	const stage = useRef<HTMLElement>(null);

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

	// Full screen: the real Fullscreen API where there is one (browser, desktop
	// app), else the stage covers the window. Esc leaves either way.
	useEffect(() => {
		const sync = () => setFull(document.fullscreenElement === stage.current && !!stage.current);
		const esc = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !document.fullscreenElement) setFull(false);
		};
		document.addEventListener("fullscreenchange", sync);
		window.addEventListener("keydown", esc);
		return () => {
			document.removeEventListener("fullscreenchange", sync);
			window.removeEventListener("keydown", esc);
		};
	}, []);
	const toggleFull = async () => {
		if (document.fullscreenElement) return void (await document.exitFullscreen());
		if (full) return setFull(false);
		try {
			await stage.current?.requestFullscreen();
		} catch {
			setFull(true);
		}
	};

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
					<Icon name="back" /> Project
				</a>
				<p>There's no draft “{name}” (it may have been discarded).</p>
			</main>
		);

	const accepted = draft.status === "accepted";
	const current = draft.versions.find((v) => v.version === selected);
	const previewHost = preview ? new URL(preview.url).host : "";

	return (
		<main className={`review ${panel ? "" : "no-panel"}`}>
			<div className="review-bar">
				<a className="icon-btn" href={href.project(id)} title="Back to the project">
					<Icon name="back" label="Back to the project" />
				</a>
				<h1 className="review-title">{draft.name}</h1>
				<span className={`status ${accepted ? "status-ok" : ""}`}>
					{accepted ? `Accepted v${draft.accepted?.version}` : "In review"}
				</span>
				<div className="version-tabs" role="tablist" aria-label="Versions">
					{draft.versions.map((v) => (
						<button
							key={v.version}
							type="button"
							role="tab"
							aria-selected={v.version === selected}
							className={v.version === selected ? "on" : ""}
							title={v.feedback ? `“${v.feedback}”` : "First version"}
							onClick={() => setSelected(v.version)}
						>
							v{v.version}
							{!v.ok && <span className="tab-warn" title="The checks found issues" />}
						</button>
					))}
				</div>
				<div className="review-actions">
					{preview && (
						<a
							className="btn btn-outline"
							href={preview.url}
							target="_blank"
							rel="noreferrer"
							title="Open this preview in your browser"
						>
							<Icon name="external" /> <span className="hide-sm">Open in browser</span>
						</a>
					)}
					<button type="button" className="btn btn-outline" onClick={toggleFull}>
						<Icon name="maximize" /> <span className="hide-sm">Full screen</span>
					</button>
					<button
						type="button"
						className={`btn ${panel ? "btn-outline" : "btn-accent"}`}
						onClick={() => setPanel((p) => !p)}
						aria-pressed={panel}
					>
						{panel ? "Hide review" : "Review"}
					</button>
				</div>
			</div>

			<div className="review-body">
				<section ref={stage} className={`stage ${full ? "is-full" : ""}`} aria-label="Preview">
					<div className="browser-bar">
						<span className="term-dot" />
						<span className="term-dot" />
						<span className="term-dot" />
						<span className="url">
							{previewHost ? (
								<>
									<span className="muted">{previewHost}/</span> {draft.name}{" "}
									<span className="accent">v{selected}</span>
								</>
							) : (
								"starting the preview…"
							)}
						</span>
						{full && (
							<button type="button" className="btn btn-outline btn-sm" onClick={toggleFull}>
								<Icon name="minimize" /> Exit full screen <kbd>Esc</kbd>
							</button>
						)}
					</div>
					{previewError && <p className="error stage-msg">{previewError}</p>}
					{!preview && !previewError && (
						<div className="stage-msg muted">Starting the preview…</div>
					)}
					{preview && <iframe title={`${draft.name} v${selected}`} src={preview.url} />}
				</section>

				{panel && (
					<aside className="side" aria-label="Review">
						{error && <p className="error">{error}</p>}
						{current && (
							<div className="card">
								<span className="eyebrow">Version {current.version}</span>
								<p className="v-note">
									{current.feedback ? `“${current.feedback}”` : "First version"}
								</p>
								<p className="muted small">
									{when(current.createdAt)}
									{!current.ok && " · the checks found issues"}
								</p>
								<p className="muted small mono">{current.files.join(" · ")}</p>
								<p className="muted small">
									From{" "}
									{draft.source.designRef?.startsWith("http") ? (
										<a href={draft.source.designRef} target="_blank" rel="noreferrer">
											the design <Icon name="external" size={12} />
										</a>
									) : (
										"a local design"
									)}
									{draft.source.agent
										? ` · ${draft.source.agent}${draft.source.model ? ` (${draft.source.model})` : ""}`
										: ""}
								</p>
							</div>
						)}

						{accepted && draft.accepted && (
							<div className="card card-ok">
								<span className="eyebrow eyebrow-ok">
									<Icon name="check" size={13} /> Accepted v{draft.accepted.version}
								</span>
								<p>
									In <code>blocks/{draft.name}/</code>
									{draft.accepted.commit ? (
										<>
											{" "}
											· commit <code>{draft.accepted.commit}</code>
										</>
									) : (
										", not committed yet"
									)}
								</p>
								<p className="muted small">{when(draft.accepted.at)}</p>
							</div>
						)}

						{!accepted && (
							<>
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
							</>
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
					</aside>
				)}
			</div>
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
		<form
			className="card stack"
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
			<span className="eyebrow">Request changes</span>
			<textarea
				rows={4}
				aria-label="What to change"
				placeholder="e.g. bigger headline, orange buttons, less space under the image"
				value={feedback}
				onChange={(e) => setFeedback(e.target.value)}
			/>
			<ModelPicker value={model} onChange={setModel} defaultLabel="Same as the draft" />
			<button type="submit" className="btn btn-accent" disabled={props.busy || !feedback.trim()}>
				<Icon name="send" />{" "}
				{props.busy ? "Working…" : `Make v${(props.from ?? 0) + 1} from v${props.from ?? ""}`}
			</button>
			{error && <p className="error">{error}</p>}
		</form>
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
	const [error, setError] = useState("");
	return (
		<div className="card stack">
			<span className="eyebrow">Accept</span>
			<p className="muted small">
				Copies v{props.version} into <code>blocks/{props.name}/</code> and commits only that folder
				on the branch, with the review rounds in the message.
			</p>
			<label className="field">
				<span>
					<Icon name="branch" size={12} /> Branch
				</span>
				<input className="mono" value={branch} onChange={(e) => setBranch(e.target.value)} />
			</label>
			<div className="row">
				<button
					type="button"
					className="btn btn-accent"
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
							props.onAccepted();
						} catch (e) {
							setError((e as Error).message);
						} finally {
							setBusy(false);
						}
					}}
				>
					<Icon name="check" /> {busy ? "Accepting…" : `Accept v${props.version ?? ""}`}
				</button>
				<button
					type="button"
					className="btn btn-ghost btn-danger push-right"
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
					<Icon name="trash" /> Discard
				</button>
			</div>
			{error && <p className="error">{error}</p>}
		</div>
	);
}
