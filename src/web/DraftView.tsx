import { useCallback, useEffect, useRef, useState } from "react";
import { AgentChips } from "./AgentChips.js";
import { isLive, useProjectJobs } from "./Agents.js";
import {
	api,
	type Draft,
	type DraftNote,
	type Job,
	type ModelChoice,
	type OpenedPull,
	type PickedElement,
	useRole,
} from "./api.js";
import { confirmAction } from "./Confirm.js";
import { DEFAULT_DEVICE, DEVICES, type DeviceKind, KINDS } from "./devices.js";
import { AgentMark, Icon } from "./Icon.js";
import { useJobLines } from "./JobLog.js";
import { useOnComputer } from "./Pairing.js";
import { usePhone } from "./phone.js";
import { href } from "./router.js";
import { useOutside } from "./useOutside.js";

/** What the review shows: one kind of device, or all three side by side. */
const VIEWS = ["desktop", "tablet", "mobile", "all"] as const;
type View = (typeof VIEWS)[number];

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

/** Room kept under a device for its caption (the device menu), in px. */
const CAPTION_H = 30;

/**
 * The block's page on one kind of device, scaled to fit its stage. The device
 * (a width from Chrome's device list) is picked under it and remembered.
 */
function DeviceFrame(props: {
	src: string;
	kind: DeviceKind;
	title: string;
	grow?: boolean;
	/** Select mode: hovering outlines elements, a click picks one (aem-eds-kit's preview frame). */
	picking: boolean;
	/** The elements already picked, numbered on the preview. */
	pins: Array<{ n: number; selector: string }>;
	onPicked: (element: PickedElement) => void;
}) {
	const names = DEVICES[props.kind].map((d) => d.name);
	const [model, setModel] = useStored(
		`studio.device.${props.kind}`,
		DEFAULT_DEVICE[props.kind],
		names,
	);
	const device = DEVICES[props.kind].find((d) => d.name === model) ?? DEVICES[props.kind][0];
	const width = device.width;
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
	const onPicked = useRef(props.onPicked);
	onPicked.current = props.onPicked;
	const deviceLabel = `${device.name} · ${device.width}px`;
	useEffect(() => {
		const on = (e: MessageEvent) => {
			if (e.source !== frame.current?.contentWindow) return;
			const d = e.data as {
				type?: string;
				height?: number;
				selector?: string;
				text?: string;
			} | null;
			if (d?.type === "eds-preview-size" && typeof d.height === "number" && d.height > 0)
				setContent(d.height);
			if (d?.type === "eds-picked" && typeof d.selector === "string")
				onPicked.current({ selector: d.selector, text: d.text ?? "", device: deviceLabel });
		};
		window.addEventListener("message", on);
		return () => window.removeEventListener("message", on);
	}, [deviceLabel]);
	// Tell the frame about Select mode and the pins, now and whenever it (re)loads.
	const [loaded, setLoaded] = useState(0);
	const pinsKey = JSON.stringify(props.pins);
	useEffect(() => {
		const w = frame.current?.contentWindow;
		if (!w || !loaded) return;
		w.postMessage({ type: "eds-pick", on: props.picking }, "*");
		w.postMessage({ type: "eds-pins", pins: JSON.parse(pinsKey) }, "*");
	}, [props.picking, pinsKey, loaded]);
	const scale = size.w ? Math.min(1, size.w / width) : 1;
	// Fill the stage, but end at the block when it is shorter: no empty page under it.
	const room = size.h > CAPTION_H ? (size.h - CAPTION_H) / scale : 0;
	const frameH = content && room ? Math.min(content, room) : room;
	return (
		// Side by side, each device gets room in proportion to its width, so all share one scale.
		<div
			className="device-stage"
			ref={box}
			style={props.grow ? { flex: `${width} 1 0` } : undefined}
		>
			<div
				className={`device device-${props.kind}${props.picking ? " picking" : ""}`}
				style={{ width: width * scale, height: frameH ? frameH * scale : undefined }}
			>
				<iframe
					ref={frame}
					title={`${props.title} on ${device.name}`}
					src={props.src}
					onLoad={() => setLoaded((n) => n + 1)}
					style={{ width, height: frameH || "100%", transform: `scale(${scale})` }}
				/>
			</div>
			<span className="device-size mono">
				<select
					className="device-model"
					aria-label={`${props.kind} device`}
					value={device.name}
					onChange={(e) => setModel(e.target.value)}
				>
					{DEVICES[props.kind].map((d) => (
						<option key={d.name} value={d.name}>
							{d.name} · {d.width}px
						</option>
					))}
				</select>
				{scale < 1 && !props.grow ? ` ${Math.round(scale * 100)}%` : ""}
			</span>
		</div>
	);
}

/** What to change in the element just picked on the preview. */
function PickBox(props: {
	element: PickedElement;
	onAdd: (text: string) => Promise<void>;
	onCancel: () => void;
}) {
	const [text, setText] = useState("");
	const [error, setError] = useState("");
	const { element } = props;
	return (
		<form
			className="pick-box"
			onSubmit={async (e) => {
				e.preventDefault();
				if (!text.trim()) return;
				try {
					await props.onAdd(text.trim());
				} catch (err) {
					setError((err as Error).message);
				}
			}}
		>
			<span className="pick-what small">
				<code>{element.selector.split(" > ").at(-1)}</code>
				{element.text && <span className="muted"> “{element.text}”</span>}
				<span className="muted"> · {element.device}</span>
			</span>
			<div className="row">
				<input
					aria-label="What should change in it"
					placeholder="What should change here?"
					value={text}
					onChange={(e) => setText(e.target.value)}
					// biome-ignore lint/a11y/noAutofocus: the box opens because you just picked this element
					autoFocus
				/>
				<button type="submit" className="btn btn-accent btn-sm" disabled={!text.trim()}>
					Add
				</button>
				<button type="button" className="btn btn-ghost btn-sm" onClick={props.onCancel}>
					Cancel
				</button>
			</div>
			{error && <p className="error small">{error}</p>}
		</form>
	);
}

/**
 * The draft as a table to paste into a document (da.live, Word, Google Docs):
 * HTML for a paste that keeps the table, plain text for anything else.
 */
function CopyForDocument(props: { id: string; name: string }) {
	const [state, setState] = useState<"idle" | "working" | "copied" | "failed">("idle");
	const copy = async () => {
		setState("working");
		// The agent may first write the block's missing texts. The clipboard takes the promise
		// at once, so the copy still counts as part of the click when the table arrives.
		const table = api.draftContent(props.id, props.name);
		const blob = (key: "html" | "text", type: string) =>
			table.then((t) => new Blob([t[key]], { type }));
		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					"text/html": blob("html", "text/html"),
					"text/plain": blob("text", "text/plain"),
				}),
			]);
			setState("copied");
		} catch {
			setState("failed");
		}
		setTimeout(() => setState("idle"), 1800);
	};
	return (
		<button
			type="button"
			className={`icon-btn bar-copy ${state}`}
			title="Copy as a table to paste into a document (da.live, Word, Google Docs)"
			aria-label="Copy the block as a table for a document"
			disabled={state === "working"}
			onClick={() => void copy()}
		>
			{state === "working" ? (
				<span
					className="spinner spinner-sm"
					role="status"
					aria-label="Writing the block's content"
				/>
			) : (
				<Icon
					name={state === "idle" ? "copy" : state === "copied" ? "check" : "close"}
					size={14}
					label={state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : undefined}
				/>
			)}
		</button>
	);
}

/** The changes waiting to be applied, numbered like their pins on the preview. */
function NotesTray(props: { notes: DraftNote[]; onRemove: (id: string) => void }) {
	return (
		<ol className="notes-tray" aria-label="Changes to apply">
			{props.notes.map((n, i) => (
				<li key={n.id}>
					<span className={`notes-n${n.element ? " pinned" : ""}`}>{i + 1}</span>
					{n.element && <code className="small">{n.element.selector.split(" > ").at(-1)}</code>}
					<span className="notes-text">{n.text}</span>
					<button
						type="button"
						className="icon-btn icon-btn-sm"
						aria-label="Remove"
						title="Remove"
						onClick={() => props.onRemove(n.id)}
					>
						<Icon name="close" size={12} />
					</button>
				</li>
			))}
		</ol>
	);
}

/** A change at work: what the agent does right now, and a link to its whole log. */
function RunningChange(props: { projectId: string; job: Job; onEnd: () => void }) {
	const { lines, status } = useJobLines(props.job, () => props.onEnd());
	// Applied: the preview above shows it, so the running line goes (so does a run the
	// studio no longer knows: whatever it made is above too).
	if (status === "done" || status === "issues" || status === "gone") return null;
	const working = status === "running" || status === "queued";
	// The CLI's closing "→ Next: …" hints are for a terminal, not for what the agent is doing.
	const now = lines.findLast((l) => !l.text.trimStart().startsWith("→"))?.text;
	return (
		<p className="draft-talk-made">
			<AgentMark working={working} />
			<span className={`draft-talk-now${working ? "" : " failed"}`}>
				{status === "queued"
					? "Waiting to start…"
					: working
						? (now ?? "Starting…")
						: `The changes weren't applied (${status}).`}
			</span>
			<a className="muted small" href={href.agents(props.projectId, props.job.id)}>
				Log
			</a>
		</p>
	);
}

/**
 * A draft under review. The preview gets the window, on a desktop, tablet or
 * mobile width. A draft is one working copy: changes are asked for in a
 * message box under the preview, like the chat; Undo takes the last one back.
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
	const [view, setView] = useStored<View>("studio.device", "desktop", VIEWS);
	// A phone shows the phone view: there is no room to switch devices.
	const phone = usePhone();
	const shown = KINDS.filter((k) => (phone ? k.id === "mobile" : view === "all" || k.id === view));
	// All three devices need every pixel: the side menu steps aside while they show.
	useEffect(() => {
		document.body.classList.toggle("review-all", view === "all" && !phone);
		return () => document.body.classList.remove("review-all");
	}, [view, phone]);
	const [error, setError] = useState("");
	const [notes, setNotes] = useState<DraftNote[]>([]);
	// Select mode: a click on the preview picks an element; what to change in it is asked next.
	const [picking, setPicking] = useState(false);
	const [picked, setPicked] = useState<PickedElement | null>(null);
	const pins = notes.flatMap((n, i) =>
		n.element ? [{ n: i + 1, selector: n.element.selector }] : [],
	);
	useEffect(() => {
		api.notes(id, name).then(setNotes, () => {});
	}, [id, name]);
	// A change to this draft started anywhere (here or from the chat) shows its log here.
	const jobs = useProjectJobs(id);
	const change =
		job ?? jobs?.find((j) => isLive(j) && j.kind === "change" && j.block === name) ?? null;

	const load = useCallback(async () => {
		try {
			const d = (await api.drafts(id)).find((x) => x.name === name) ?? null;
			setDraft(d);
			// The draft is its latest version (or the accepted one): there's no picking older ones.
			if (d) setSelected(d.accepted?.version ?? d.versions.at(-1)?.version ?? null);
		} catch (e) {
			setError((e as Error).message);
		}
	}, [id, name]);
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
	const previewHost = preview ? new URL(preview.url).host : "";

	return (
		<main className="review">
			<div className="review-bar">
				<a className="icon-btn" href={href.drafts(id)} title="Back to the project">
					<Icon name="back" label="Back to the project" />
				</a>
				<h1 className="review-title">{draft.name}</h1>
				<span className={`status ${accepted ? "status-ok" : ""}`}>
					{accepted ? "Accepted" : "In review"}
				</span>
				<fieldset className="device-switch">
					<legend className="sr-only">Device</legend>
					{KINDS.map((k) => (
						<button
							key={k.id}
							type="button"
							aria-pressed={k.id === view}
							className={k.id === view ? "on" : ""}
							title={k.label}
							onClick={() => setView(k.id)}
						>
							<Icon name={k.icon} /> <span className="hide-md">{k.label}</span>
						</button>
					))}
					<button
						type="button"
						aria-pressed={view === "all"}
						className={view === "all" ? "on" : ""}
						title="Desktop, tablet and mobile side by side"
						onClick={() => setView("all")}
					>
						<Icon name="devices" /> <span className="hide-md">All</span>
					</button>
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
				</div>
			</div>

			<div className="review-body">
				<div className="review-main">
					<section className="stage" aria-label="Preview">
						<div className="browser-bar">
							{/* Where the preview runs, for anyone who looks for it; a click opens it in the browser. */}
							{preview ? (
								<a
									className="bar-host"
									href={preview.url}
									target="_blank"
									rel="noreferrer"
									title="Open this preview in your browser"
								>
									{previewHost} <Icon name="external" size={12} />
								</a>
							) : (
								<span className="bar-host muted">starting the preview…</span>
							)}
							{!accepted && (
								<button
									type="button"
									className={`btn btn-sm bar-btn ${picking ? "btn-accent" : "btn-outline"}`}
									aria-pressed={picking}
									title="Click an element of the preview to say what to change in it"
									onClick={() => {
										setPicking(!picking);
										setPicked(null);
									}}
								>
									<Icon name="pointer" size={14} /> <span className="bar-label">Select</span>
								</button>
							)}
							{!accepted && draft.versions.length > 1 && (
								<button
									type="button"
									className="btn btn-sm btn-outline bar-btn"
									disabled={running}
									title="Take back the last change"
									onClick={() =>
										void api.undoDraft(id, name).then(
											() => load(),
											(e: Error) => setError(e.message),
										)
									}
								>
									<Icon name="history" size={14} /> <span className="bar-label">Undo</span>
								</button>
							)}
							<CopyForDocument id={id} name={name} />
						</div>
						{previewError && <p className="error stage-msg">{previewError}</p>}
						{!preview && !previewError && (
							<div className="stage-msg muted">Starting the preview…</div>
						)}
						{/* The CLI's preview serves the block's page alone at /__eds_preview_frame
					    (its harness page, with its own toolbar, is what the open-in-browser icon shows). */}
						{preview && (
							<div className="device-frames">
								{shown.map((k) => (
									<DeviceFrame
										key={`${preview.url}-${k.id}`}
										src={`${preview.url.replace(/\/?$/, "/")}__eds_preview_frame`}
										kind={k.id}
										title={draft.name}
										grow={view === "all"}
										picking={picking}
										pins={pins}
										onPicked={setPicked}
									/>
								))}
							</div>
						)}
					</section>
					{error && <p className="error review-note">{error}</p>}
					{change && (
						<div className="review-running">
							<RunningChange
								key={change.id}
								projectId={id}
								job={change}
								onEnd={() => {
									setRunning(false);
									void load();
								}}
							/>
						</div>
					)}
					{picked && (
						<PickBox
							element={picked}
							onAdd={async (text) => {
								setNotes(await api.addNote(id, name, text, picked));
								setPicked(null);
							}}
							onCancel={() => setPicked(null)}
						/>
					)}
					{!accepted && notes.length > 0 && (
						<NotesTray
							notes={notes}
							onRemove={(note) =>
								void api
									.removeNote(id, name, note)
									.then(setNotes, (e: Error) => setError(e.message))
							}
						/>
					)}
					{!accepted && (
						<RefineBox
							id={id}
							name={name}
							busy={running}
							notes={notes}
							onNotes={setNotes}
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
 * The review's message box, for a change to the whole block. What you write is
 * collected with the elements picked on the preview; nothing runs until Apply
 * changes, which sends all of it to the agent at once.
 */
function RefineBox(props: {
	id: string;
	name: string;
	busy: boolean;
	notes: DraftNote[];
	onNotes: (notes: DraftNote[]) => void;
	onStarted: (job: Job) => void;
}) {
	const [text, setText] = useState("");
	const [model, setModel] = useState<ModelChoice>({});
	const [error, setError] = useState("");
	const run = async (fn: () => Promise<void>) => {
		setError("");
		try {
			await fn();
		} catch (err) {
			setError((err as Error).message);
		}
	};
	const add = () =>
		run(async () => {
			if (!text.trim()) return;
			props.onNotes(await api.addNote(props.id, props.name, text));
			setText("");
		});
	const make = () =>
		run(async () => {
			// Whatever is still in the box goes along with the collected changes.
			if (text.trim()) {
				props.onNotes(await api.addNote(props.id, props.name, text));
				setText("");
			}
			props.onStarted(await api.refine(props.id, props.name, { notes: true, ...model }));
			props.onNotes([]);
		});
	const pending = props.notes.length + (text.trim() ? 1 : 0);
	return (
		<form
			className="composer review-composer"
			onSubmit={(e) => {
				e.preventDefault();
				void add();
			}}
		>
			<textarea
				rows={2}
				aria-label="What to change"
				placeholder="What should change? Changes wait until you apply them"
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.shiftKey) {
						e.preventDefault();
						void add();
					}
				}}
			/>
			<div className="row composer-foot">
				<AgentChips value={model} onChange={setModel} />
				<button
					type="submit"
					className="icon-btn push-right"
					aria-label="Add to the changes"
					title="Add to the changes to apply (Enter)"
					disabled={!text.trim()}
				>
					<Icon name="plus" />
				</button>
				<button
					type="button"
					className="btn btn-accent btn-sm"
					disabled={props.busy || !pending}
					title={`Send ${pending} ${pending === 1 ? "change" : "changes"} to the agent`}
					onClick={() => void make()}
				>
					{props.busy ? (
						<span className="spinner spinner-ink" aria-hidden="true" />
					) : (
						<>
							Apply changes
							{pending ? <span className="make-count">{pending}</span> : null}
						</>
					)}
				</button>
			</div>
			{error && <p className="msg-error small">{error}</p>}
		</form>
	);
}

/**
 * Open pull request: first pick who reviews it from the repository's
 * collaborators; it is assigned to you.
 */
function OpenPull(props: {
	id: string;
	busy: boolean;
	disabled: boolean;
	onOpen: (reviewers: string[]) => void;
}) {
	const [open, setOpen] = useState(false);
	const [people, setPeople] = useState<Array<{ login: string; avatar: string }> | null>(null);
	const [me, setMe] = useState("");
	const [picked, setPicked] = useState<string[]>([]);
	const [error, setError] = useState("");
	const box = useRef<HTMLSpanElement>(null);
	const close = useCallback(() => setOpen(false), []);
	useOutside(box, open, close);
	useEffect(() => {
		if (!open || people) return;
		api.collaborators(props.id).then(
			(r) => {
				setPeople(r.people);
				setMe(r.me);
			},
			(e: Error) => {
				setPeople([]);
				setError(e.message);
			},
		);
	}, [open, people, props.id]);
	const toggle = (login: string) =>
		setPicked((p) => (p.includes(login) ? p.filter((x) => x !== login) : [...p, login]));
	return (
		<span className="accept-step" ref={box}>
			<button
				type="button"
				className="btn btn-accent"
				disabled={props.busy || props.disabled}
				aria-expanded={open}
				title={props.busy ? "Writing the description and taking screenshots" : undefined}
				onClick={() => setOpen(!open)}
			>
				{props.busy ? (
					<span className="spinner spinner-ink" aria-hidden="true" />
				) : (
					<Icon name="branch" />
				)}{" "}
				Open pull request
			</button>
			{open && !props.busy && (
				<div className="composer-menu accept-pop">
					<strong className="small">Reviewers</strong>
					{!people && <p className="muted small">Loading…</p>}
					{error && <p className="error small">{error}</p>}
					{people?.length === 0 && !error && (
						<p className="muted small">No one else can push to this repository.</p>
					)}
					<ul className="reviewer-list">
						{people?.map((p) => (
							<li key={p.login}>
								<label>
									<input
										type="checkbox"
										checked={picked.includes(p.login)}
										onChange={() => toggle(p.login)}
									/>
									<img src={p.avatar} alt="" width={20} height={20} />
									{p.login}
								</label>
							</li>
						))}
					</ul>
					{me && <p className="muted small">Assigned to you ({me}).</p>}
					<button
						type="button"
						className="btn btn-accent btn-sm"
						onClick={() => {
							setOpen(false);
							props.onOpen(picked);
						}}
					>
						Open pull request
					</button>
				</div>
			)}
		</span>
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
			detail: "The draft and its changes go. The repository doesn't change.",
			action: "Discard draft",
		});
		if (!ok) return;
		await step(async () => {
			await api.discard(props.id, props.name);
			location.hash = href.drafts(props.id);
		});
	};

	// The draft's branch is behind the default branch: bring the newer commits in.
	const update = !!draft.behind && (
		<button
			type="button"
			className="btn btn-outline btn-sm"
			disabled={busy}
			title={`The default branch has ${draft.behind} commit${draft.behind === 1 ? "" : "s"} ${draft.branch} doesn't. Merge them in.`}
			onClick={() =>
				step(async () => {
					await api.updateDraft(props.id, props.name);
					props.onAccepted();
				})
			}
		>
			{draft.behind} behind · Update
		</button>
	);
	const reopen = (
		<button
			type="button"
			className="icon-btn"
			disabled={busy}
			aria-label="Reopen the draft"
			title="Reopen: back into review, with its changes and branch"
			onClick={() =>
				step(async () => {
					await api.reopenDraft(props.id, props.name);
					setPull(undefined);
					props.onAccepted();
				})
			}
		>
			<Icon name="history" />
		</button>
	);

	if (accepted) {
		if (!draft.branch)
			return draft.accepted?.commit ? (
				<span className="muted small">
					commit <code>{draft.accepted.commit}</code>
				</span>
			) : null;
		if (pull)
			return (
				<>
					{error && <span className="error small">{error}</span>}
					{update}
					{reopen}
					<a className="btn btn-outline" href={pull.url} target="_blank" rel="noreferrer">
						<Icon name="branch" /> Pull request #{pull.number}
					</a>
				</>
			);
		return (
			<>
				{error && <span className="error small">{error}</span>}
				{update}
				{reopen}
				<OpenPull
					id={props.id}
					busy={busy}
					disabled={pull === undefined}
					onOpen={(reviewers) =>
						step(async () => {
							const r = await api.openDraftPull(props.id, props.name, reviewers);
							setPull(r.pull);
							if (r.warning) setError(`Opened without screenshots: ${r.warning}`);
							window.open(r.pull.url, "_blank", "noreferrer");
						})
					}
				/>
			</>
		);
	}
	return (
		<>
			{error && <span className="error small">{error}</span>}
			{update}
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
					{busy ? (
						<span className="spinner spinner-ink" aria-hidden="true" />
					) : (
						<Icon name="check" />
					)}{" "}
					Accept
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
