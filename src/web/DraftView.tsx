import { useCallback, useEffect, useRef, useState } from "react";
import { AgentChips } from "./AgentChips.js";
import { isLive, useProjectJobs } from "./Agents.js";
import {
	api,
	type Draft,
	type DraftNote,
	type DraftVersion,
	type EdsEvent,
	type Job,
	type ModelChoice,
	type OpenedPull,
	useRole,
} from "./api.js";
import { confirmAction } from "./Confirm.js";
import { DEFAULT_DEVICE, DEVICES, type DeviceKind, KINDS } from "./devices.js";
import { AgentMark, Icon } from "./Icon.js";
import { useJobLines } from "./JobLog.js";
import { useOnComputer } from "./Pairing.js";
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
function DeviceFrame(props: { src: string; kind: DeviceKind; title: string; grow?: boolean }) {
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
				className={`device device-${props.kind}`}
				style={{ width: width * scale, height: frameH ? frameH * scale : undefined }}
			>
				<iframe
					ref={frame}
					title={`${props.title} on ${device.name}`}
					src={props.src}
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

/**
 * The draft's conversation, as a thread like the chat: each change asked for
 * (from the review or the chat) and the version the agent made, and a running
 * change as one line saying what it does, with its full log in Agents.
 * Folded, it is one line, so the preview keeps the room.
 */
function Conversation(props: {
	projectId: string;
	versions: DraftVersion[];
	job: Job | null;
	onEnd: (events: EdsEvent[]) => void;
	/** Changes collected for the next version, not sent yet. */
	notes: DraftNote[];
	onRemoveNote: (id: string) => void;
}) {
	const [open, setOpen] = useStored("studio.draftTalk", "closed", ["open", "closed"]);
	const asks = props.versions.filter((v) => v.feedback).length;
	const box = useRef<HTMLOListElement>(null);
	const shown = open === "open" || !!props.job || props.notes.length > 0;
	const next = (props.versions.at(-1)?.version ?? 0) + 1;
	// Open at the newest entry, like the chat.
	const count = props.versions.length + props.notes.length;
	useEffect(() => {
		if (shown && count) box.current?.scrollTo({ top: box.current.scrollHeight });
	}, [shown, count]);
	return (
		<section className="draft-talk" aria-label="Conversation">
			<button
				type="button"
				className="draft-talk-head"
				aria-expanded={shown}
				onClick={() => setOpen(open === "open" ? "closed" : "open")}
			>
				Conversation
				<span className="muted">
					· {asks} {asks === 1 ? "change" : "changes"}
				</span>
				<Icon name="chevron" size={14} />
			</button>
			{shown && (
				<ol className="draft-talk-list" ref={box}>
					{props.versions.map((v) => (
						<li key={v.version}>
							{v.feedback && <Ask text={v.feedback} />}
							<p className="draft-talk-made">
								<AgentMark />
								<span>
									<span className="accent">v{v.version}</span>{" "}
									{v.feedback ? "ready" : "from the design"}
									<span className="muted"> · {new Date(v.createdAt).toLocaleString()}</span>
								</span>
								{!v.ok && <span className="tag warn">issues</span>}
							</p>
						</li>
					))}
					{props.notes.map((n) => (
						<li key={n.id} className="draft-talk-note">
							<Ask text={n.text} pending />
							<span className="muted small">
								for v{next} ·{" "}
								<button type="button" className="link-btn" onClick={() => props.onRemoveNote(n.id)}>
									remove
								</button>
							</span>
						</li>
					))}
					{props.job && (
						<li>
							<RunningChange
								key={props.job.id}
								projectId={props.projectId}
								job={props.job}
								onEnd={props.onEnd}
							/>
						</li>
					)}
				</ol>
			)}
		</section>
	);
}

/** Lines a request shows before "Show all": a pasted log shouldn't fill the conversation. */
const ASK_LINES = 6;

/** A request in the conversation; a long one folds, and one that reads like a log is monospace. */
function Ask(props: { text: string; pending?: boolean }) {
	const [all, setAll] = useState(false);
	const lines = props.text.split("\n");
	const long = lines.length > ASK_LINES || props.text.length > 600;
	const log = lines.length > 3 && /^\s*(>|\$|\d+:\d+|✖|Error|at |npm |pnpm )/m.test(props.text);
	return (
		<div className={`draft-talk-ask${props.pending ? " pending" : ""}${log ? " log" : ""}`}>
			<p className={long && !all ? "folded" : ""}>{props.text}</p>
			{long && (
				<button type="button" className="link-btn small" onClick={() => setAll((a) => !a)}>
					{all ? "Show less" : "Show all"}
				</button>
			)}
		</div>
	);
}

/** A change at work: what the agent does right now, and a link to its whole log. */
function RunningChange(props: {
	projectId: string;
	job: Job;
	onEnd: (events: EdsEvent[]) => void;
}) {
	const { lines, status } = useJobLines(props.job, (_j, events) => props.onEnd(events));
	// Done: the new version above says it all, so the running line goes.
	if (status === "done") return null;
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
						: `The next version wasn't made (${status}).`}
			</span>
			<a className="muted small" href={href.agents(props.projectId, props.job.id)}>
				Log
			</a>
		</p>
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
	const [view, setView] = useStored<View>("studio.device", "desktop", VIEWS);
	const shown = KINDS.filter((k) => view === "all" || k.id === view);
	// All three devices need every pixel: the side menu steps aside while they show.
	useEffect(() => {
		document.body.classList.toggle("review-all", view === "all");
		return () => document.body.classList.remove("review-all");
	}, [view]);
	const [error, setError] = useState("");
	const [notes, setNotes] = useState<DraftNote[]>([]);
	useEffect(() => {
		api.notes(id, name).then(setNotes, () => {});
	}, [id, name]);
	// A change to this draft started anywhere (here or from the chat) shows its log here.
	const jobs = useProjectJobs(id);
	const change =
		job ?? jobs?.find((j) => isLive(j) && j.kind === "change" && j.block === name) ?? null;

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
										<span className="muted">· {view}</span>
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
							<div className="device-frames">
								{shown.map((k) => (
									<DeviceFrame
										key={`${preview.url}-${k.id}`}
										src={`${preview.url.replace(/\/?$/, "/")}__eds_preview_frame`}
										kind={k.id}
										title={`${draft.name} v${selected}`}
										grow={view === "all"}
									/>
								))}
							</div>
						)}
					</section>
					{error && <p className="error review-note">{error}</p>}
					<Conversation
						projectId={id}
						versions={draft.versions}
						job={change}
						notes={accepted ? [] : notes}
						onRemoveNote={(note) =>
							void api.removeNote(id, name, note).then(setNotes, (e: Error) => setError(e.message))
						}
						onEnd={(events) => {
							setRunning(false);
							const d = events.find((e) => e.type === "draft");
							void load(d ? Number(d.version) : undefined);
						}}
					/>
					{!accepted && (
						<RefineBox
							id={id}
							name={name}
							versions={draft.versions}
							from={selected ?? undefined}
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
 * The review's message box. What you write is collected for the next version
 * (it shows in the conversation); nothing runs until Make vN, which sends all
 * of it to the agent at once, starting from the version you pick.
 */
function RefineBox(props: {
	id: string;
	name: string;
	versions: DraftVersion[];
	/** The version under review, the default start. */
	from?: number;
	busy: boolean;
	notes: DraftNote[];
	onNotes: (notes: DraftNote[]) => void;
	onStarted: (job: Job) => void;
}) {
	const [text, setText] = useState("");
	const [model, setModel] = useState<ModelChoice>({});
	const [from, setFrom] = useState(props.from);
	const [error, setError] = useState("");
	useEffect(() => setFrom(props.from), [props.from]);
	const latest = props.versions.at(-1)?.version ?? 0;
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
			props.onStarted(
				await api.refine(props.id, props.name, { notes: true, version: from, ...model }),
			);
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
				placeholder="What should change? Each change waits for the next version"
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
				<label className="chip-select" title="The version the next one starts from">
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
					className="icon-btn push-right"
					aria-label={`Add to v${latest + 1}`}
					title={`Add to the changes for v${latest + 1} (Enter)`}
					disabled={!text.trim()}
				>
					<Icon name="plus" />
				</button>
				<button
					type="button"
					className="btn btn-accent btn-sm"
					disabled={props.busy || !pending}
					title={`Send ${pending} ${pending === 1 ? "change" : "changes"} to the agent and make v${latest + 1} from v${from ?? latest}`}
					onClick={() => void make()}
				>
					{props.busy ? (
						<span className="spinner spinner-ink" aria-hidden="true" />
					) : (
						<>
							Make v{latest + 1}
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
				onClick={() => setOpen(!open)}
			>
				<Icon name="branch" />{" "}
				{props.busy ? "Writing it, taking screenshots…" : "Open pull request"}
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
			detail: "The draft and all its versions go. The repository doesn't change.",
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
			className="btn btn-ghost btn-sm"
			disabled={busy}
			title="Back into review, with its versions and branch"
			onClick={() =>
				step(async () => {
					await api.reopenDraft(props.id, props.name);
					setPull(undefined);
					props.onAccepted();
				})
			}
		>
			Reopen
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
