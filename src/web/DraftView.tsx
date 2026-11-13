import { useCallback, useEffect, useRef, useState } from "react";
import { AgentChips } from "./AgentChips.js";
import {
	api,
	type Draft,
	type DraftVersion,
	type Job,
	type ModelChoice,
	type OpenedPull,
	useRole,
} from "./api.js";
import { confirmAction } from "./Confirm.js";
import { Icon } from "./Icon.js";
import { JobLog } from "./JobLog.js";
import { useOnComputer } from "./Pairing.js";
import { href } from "./router.js";
import { useOutside } from "./useOutside.js";

/** The three devices a draft is reviewed on; each is scaled down to fit the window. */
const DEVICES = [
	{ id: "desktop", label: "Desktop", width: 1440, icon: "desktop" },
	{ id: "tablet", label: "Tablet", width: 768, icon: "tablet" },
	{ id: "mobile", label: "Mobile", width: 390, icon: "phone" },
] as const;
type DeviceId = (typeof DEVICES)[number]["id"];

/** Remember a per-viewer choice (the device); storage may be unavailable. */
function useStored<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
	const [value, setValue] = useState<T>(() => {
		try {
			const v = localStorage.getItem(key) as T | null;
			return v && allowed.includes(v) ? v : fallback;
		} catch {
			return fallback;
		}
	});
	const set = (v: T) => {
		setValue(v);
		try {
			localStorage.setItem(key, v);
		} catch {}
	};
	return [value, set] as const;
}

/** The block's page at a device width, scaled to fit the stage. */
function DeviceFrame(props: { src: string; width: number; device: DeviceId; title: string }) {
	const box = useRef<HTMLDivElement>(null);
	const frame = useRef<HTMLIFrameElement>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	// The block's height at this width, posted by the CLI's preview frame
	// (eds-preview-size, aem-eds-kit 0.4.62+); unknown with an older CLI.
	const [content, setContent] = useState(0);
	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const ro = new ResizeObserver(([e]) =>
			setSize({ w: e.contentRect.width, h: e.contentRect.height }),
		);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	useEffect(() => {
		const on = (e: MessageEvent) => {
			if (e.source !== frame.current?.contentWindow) return;
			const d = e.data as { type?: string; height?: number } | null;
			if (d?.type === "eds-preview-size" && typeof d.height === "number" && d.height > 0)
				setContent(d.height);
		};
		window.addEventListener("message", on);
		return () => window.removeEventListener("message", on);
	}, []);
	const scale = size.w ? Math.min(1, size.w / props.width) : 1;
	// Fill the stage, but end at the block when it is shorter: no empty page under it.
	const room = size.h ? size.h / scale : 0;
	const frameH = content && room ? Math.min(content, room) : room;
	return (
		<div className="device-stage" ref={box}>
			<div
				className={`device device-${props.device}`}
				style={{ width: props.width * scale, height: frameH ? frameH * scale : undefined }}
			>
				<iframe
					ref={frame}
					title={props.title}
					src={props.src}
					style={{
						width: props.width,
						height: frameH || "100%",
						transform: `scale(${scale})`,
					}}
				/>
			</div>
			<span className="device-size mono">
				{props.width}px{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}
			</span>
		</div>
	);
}

/** The version under review, as one dropdown: each version with its review comment, latest first. */
function VersionPicker(props: {
	versions: DraftVersion[];
	selected: number | null;
	onPick: (version: number) => void;
}) {
	const [open, setOpen] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	const close = useCallback(() => setOpen(false), []);
	useOutside(box, open, close);
	const latest = props.versions.at(-1)?.version;
	const current = props.versions.find((v) => v.version === props.selected);
	return (
		<div className="version-picker" ref={box}>
			<button
				type="button"
				className={`chip-btn${open ? " on" : ""}`}
				aria-expanded={open}
				onClick={() => setOpen(!open)}
			>
				v{props.selected}
				{props.selected === latest ? " · latest" : ""}
				{current && !current.ok && <span className="tab-warn" title="The checks found issues" />}
				<Icon name="chevron" size={12} />
			</button>
			{open && (
				<ul className="composer-menu version-menu" aria-label="Versions">
					{[...props.versions].reverse().map((v) => (
						<li key={v.version}>
							<button
								type="button"
								aria-current={v.version === props.selected}
								className={v.version === props.selected ? "on" : ""}
								onClick={() => {
									props.onPick(v.version);
									close();
								}}
							>
								<span className="mono">v{v.version}</span>
								<span className="version-note">
									{v.feedback ? `“${v.feedback}”` : "First version"}
								</span>
								{!v.ok && <span className="tag warn">issues</span>}
								{v.version === props.selected && <Icon name="check" size={14} />}
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

/**
 * A draft under review. The preview gets the window, on a desktop, tablet or
 * mobile width. The bar picks the version and accepts it; changes are asked
 * for in a message box under the preview, like the chat.
 */
export function DraftView(props: { id: string; name: string }) {
	const { id, name } = props;
	const onComputer = useOnComputer();
	const role = useRole(id);
	const [draft, setDraft] = useState<Draft | null | undefined>(undefined);
	const [selected, setSelected] = useState<number | null>(null);
	const [preview, setPreview] = useState<{ url: string; version?: number } | null>(null);
	const [previewError, setPreviewError] = useState("");
	const [job, setJob] = useState<Job | null>(null);
	const [running, setRunning] = useState(false);
	const [device, setDevice] = useStored<DeviceId>("studio.device", "desktop", [
		"desktop",
		"tablet",
		"mobile",
	]);
	const dev = DEVICES.find((d) => d.id === device) ?? DEVICES[0];
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
				<a className="back" href={href.drafts(id)}>
					<Icon name="back" /> Project
				</a>
				<p>There's no draft “{name}” (it may have been discarded).</p>
			</main>
		);

	const accepted = draft.status === "accepted";
	const current = draft.versions.find((v) => v.version === selected);
	const previewHost = preview ? new URL(preview.url).host : "";

	return (
		<main className="review">
			<div className="review-bar">
				<a className="icon-btn" href={href.drafts(id)} title="Back to the project">
					<Icon name="back" label="Back to the project" />
				</a>
				<h1 className="review-title">{draft.name}</h1>
				<span className={`status ${accepted ? "status-ok" : ""}`}>
					{accepted ? `Accepted v${draft.accepted?.version}` : "In review"}
				</span>
				<VersionPicker versions={draft.versions} selected={selected} onPick={setSelected} />
				<fieldset className="device-switch">
					<legend className="sr-only">Device</legend>
					{DEVICES.map((d) => (
						<button
							key={d.id}
							type="button"
							aria-pressed={d.id === device}
							className={d.id === device ? "on" : ""}
							title={`${d.label} · ${d.width}px`}
							onClick={() => setDevice(d.id)}
						>
							<Icon name={d.icon} /> <span className="hide-md">{d.label}</span>
						</button>
					))}
				</fieldset>
				<div className="review-actions">
					{role !== "contributor" && onComputer && (
						<ReviewSteps
							id={id}
							name={name}
							draft={draft}
							version={selected ?? undefined}
							onAccepted={() => load()}
						/>
					)}
					{draft.preview && (
						<a
							className="btn btn-outline"
							href={draft.preview}
							target="_blank"
							rel="noreferrer"
							title={`The draft's branch, ${draft.branch}, on aem.page: anyone can open it. It needs the AEM Code Sync app on the repository.`}
						>
							<Icon name="globe" /> Live
						</a>
					)}
					{preview && (
						<a
							className="icon-btn"
							href={preview.url}
							target="_blank"
							rel="noreferrer"
							aria-label="Open this preview in your browser"
							title="Open this preview in your browser"
						>
							<Icon name="external" />
						</a>
					)}
				</div>
			</div>

			<div className="review-body">
				<div className="review-main">
					<section className="stage" aria-label="Preview">
						<div className="browser-bar">
							<span className="term-dot" />
							<span className="term-dot" />
							<span className="term-dot" />
							<span className="url">
								{previewHost ? (
									<>
										<span className="muted">{previewHost}/</span> {draft.name}{" "}
										<span className="accent">v{selected}</span>{" "}
										<span className="muted">· {dev.label.toLowerCase()}</span>
									</>
								) : (
									"starting the preview…"
								)}
							</span>
						</div>
						{previewError && <p className="error stage-msg">{previewError}</p>}
						{!preview && !previewError && (
							<div className="stage-msg muted">Starting the preview…</div>
						)}
						{/* The CLI's preview serves the block's page alone at /__eds_preview_frame
					    (its harness page, with its own toolbar, is what the open-in-browser icon shows). */}
						{preview && (
							<DeviceFrame
								key={preview.url}
								src={`${preview.url.replace(/\/?$/, "/")}__eds_preview_frame`}
								width={dev.width}
								device={dev.id}
								title={`${draft.name} v${selected} on ${dev.label}`}
							/>
						)}
					</section>
					{!accepted && (
						<RefineBox
							id={id}
							name={name}
							versions={draft.versions}
							from={selected ?? undefined}
							busy={running}
							onStarted={(j) => {
								setJob(j);
								setRunning(true);
							}}
						/>
					)}
				</div>
			</div>
		</main>
	);
}

/**
 * Asking for a change, as in the chat: one message box under the preview, with
 * the version to start from and the agent beside the send button.
 */
function RefineBox(props: {
	id: string;
	name: string;
	versions: DraftVersion[];
	/** The version under review, the default start. */
	from?: number;
	busy: boolean;
	onStarted: (job: Job) => void;
}) {
	const [feedback, setFeedback] = useState("");
	const [model, setModel] = useState<ModelChoice>({});
	const [from, setFrom] = useState(props.from);
	const [error, setError] = useState("");
	useEffect(() => setFrom(props.from), [props.from]);
	const latest = props.versions.at(-1)?.version ?? 0;
	const send = async () => {
		if (!feedback.trim() || props.busy) return;
		setError("");
		try {
			props.onStarted(
				await api.refine(props.id, props.name, { feedback, version: from, ...model }),
			);
			setFeedback("");
		} catch (err) {
			setError((err as Error).message);
		}
	};
	return (
		<form
			className="composer review-composer"
			onSubmit={(e) => {
				e.preventDefault();
				void send();
			}}
		>
			<textarea
				rows={2}
				aria-label="What to change"
				placeholder="What should change? e.g. bigger headline, orange buttons"
				value={feedback}
				onChange={(e) => setFeedback(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.shiftKey) {
						e.preventDefault();
						void send();
					}
				}}
			/>
			<div className="row composer-foot">
				<label className="chip-select" title="The version the change starts from">
					<span className="muted">from</span>
					<select value={from ?? ""} onChange={(e) => setFrom(Number(e.target.value))}>
						{[...props.versions].reverse().map((v) => (
							<option key={v.version} value={v.version}>
								v{v.version}
								{v.version === latest ? " · latest" : ""}
							</option>
						))}
					</select>
				</label>
				<AgentChips value={model} onChange={setModel} />
				<button
					type="submit"
					className="send-btn push-right"
					aria-label={`Make v${latest + 1}`}
					title={`Make v${latest + 1} from v${from ?? latest}`}
					disabled={props.busy || !feedback.trim()}
				>
					{props.busy ? (
						<span className="spinner spinner-ink" aria-hidden="true" />
					) : (
						<Icon name="arrowUp" size={18} />
					)}
				</button>
			</div>
			{error && <p className="msg-error small">{error}</p>}
		</form>
	);
}

/**
 * Accepting, in the review's bar. A GitHub draft takes two steps: Accept the
 * version under review (it becomes the tip of draft/<name>), then Open pull
 * request; once open, a link to it. A local folder's draft is accepted into
 * blocks/ and committed on a branch named in a small form. Discard sits beside.
 */
function ReviewSteps(props: {
	id: string;
	name: string;
	draft: Draft;
	version?: number;
	onAccepted: () => void;
}) {
	const { draft } = props;
	const accepted = draft.status === "accepted";
	const [pull, setPull] = useState<OpenedPull | null | undefined>(undefined);
	const [branch, setBranch] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!accepted || !draft.branch) return;
		api.draftPull(props.id, props.name).then(
			(r) => setPull(r.pull),
			() => setPull(null),
		);
	}, [props.id, props.name, accepted, draft.branch]);
	const step = async (work: () => Promise<void>) => {
		setBusy(true);
		setError("");
		try {
			await work();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	const accept = (b?: string) =>
		step(async () => {
			const r = await api.accept(props.id, props.name, {
				version: props.version,
				...(b ? { branch: b } : {}),
			});
			if (!r.ok && r.error) throw new Error(r.error);
			setBranch(null);
			props.onAccepted();
		});
	const discard = async () => {
		const ok = await confirmAction({
			title: "Discard this draft?",
			item: props.name,
			detail: "The draft and all its versions go. The repository doesn't change.",
			action: "Discard draft",
		});
		if (!ok) return;
		await step(async () => {
			await api.discard(props.id, props.name);
			location.hash = href.drafts(props.id);
		});
	};

	if (accepted) {
		if (!draft.branch)
			return draft.accepted?.commit ? (
				<span className="muted small">
					commit <code>{draft.accepted.commit}</code>
				</span>
			) : null;
		if (pull)
			return (
				<a className="btn btn-outline" href={pull.url} target="_blank" rel="noreferrer">
					<Icon name="branch" /> Pull request #{pull.number}
				</a>
			);
		return (
			<>
				{error && <span className="error small">{error}</span>}
				<button
					type="button"
					className="btn btn-accent"
					disabled={busy || pull === undefined}
					onClick={() =>
						step(async () => {
							const r = await api.openDraftPull(props.id, props.name);
							setPull(r.pull);
							if (r.warning) setError(`Opened without screenshots: ${r.warning}`);
							window.open(r.pull.url, "_blank", "noreferrer");
						})
					}
				>
					<Icon name="branch" /> {busy ? "Writing it, taking screenshots…" : "Open pull request"}
				</button>
			</>
		);
	}
	return (
		<>
			{error && <span className="error small">{error}</span>}
			<button
				type="button"
				className="icon-btn"
				aria-label="Discard the draft"
				title="Discard the draft"
				disabled={busy}
				onClick={() => void discard()}
			>
				<Icon name="trash" />
			</button>
			<span className="accept-step">
				<button
					type="button"
					className="btn btn-accent"
					disabled={busy || !props.version}
					onClick={() =>
						draft.branch ? accept() : setBranch(branch === null ? `feature/${props.name}` : null)
					}
				>
					<Icon name="check" /> {busy ? "Accepting…" : `Accept v${props.version ?? ""}`}
				</button>
				{branch !== null && (
					<form
						className="composer-menu accept-pop"
						onSubmit={(e) => {
							e.preventDefault();
							void accept(branch.trim());
						}}
					>
						<label className="field">
							<span>
								<Icon name="branch" size={12} /> Commit on the branch
							</span>
							<input
								className="mono"
								value={branch}
								// biome-ignore lint/a11y/noAutofocus: the form opened to type a branch
								autoFocus
								onChange={(e) => setBranch(e.target.value)}
							/>
						</label>
						<button
							type="submit"
							className="btn btn-accent btn-sm"
							disabled={busy || !branch.trim()}
						>
							Accept into blocks/{props.name}/
						</button>
					</form>
				)}
			</span>
		</>
	);
}
