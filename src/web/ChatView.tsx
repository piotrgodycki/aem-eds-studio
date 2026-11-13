import { type DragEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	api,
	type ChatMessage,
	type ChatThread,
	type Job,
	type ModelChoice,
	type Project,
} from "./api.js";
import { Icon } from "./Icon.js";
import { JobLog } from "./JobLog.js";
import { Markdown } from "./Markdown.js";
import { ModelPicker } from "./ModelPicker.js";
import { NewDraft, toBase64 } from "./ProjectView.js";
import { type DraggedPull, PULL_DRAG_TYPE } from "./PullsPanel.js";
import { href } from "./router.js";
import { type DraggedThread, markSeen, THREAD_DRAG_TYPE, THREADS_CHANGED } from "./ThreadLinks.js";

type Action = NonNullable<ChatMessage["action"]>;

/** What the agent proposes, with the yes that runs it; nothing runs before that. */
function ActionCard(props: { project: Project; action: Action; onBuild: (a: Action) => void }) {
	const { action } = props;
	const [error, setError] = useState("");
	const refine = async () => {
		try {
			await api.refine(props.project.id, action.name, { feedback: action.feedback ?? "" });
			location.hash = href.draft(props.project.id, action.name);
		} catch (e) {
			setError((e as Error).message);
		}
	};
	return (
		<div className="action-card">
			<span className="eyebrow">
				<Icon name="sparkle" size={13} /> Proposed
			</span>
			{action.type === "block" ? (
				<p>
					Build the block <code>{action.name}</code> from{" "}
					<a href={action.design} target="_blank" rel="noreferrer">
						the design
					</a>
					.
				</p>
			) : (
				<p>
					Change the draft <code>{action.name}</code>: “{action.feedback}”
				</p>
			)}
			<div className="row">
				<button
					type="button"
					className="btn btn-accent btn-sm"
					onClick={() => (action.type === "block" ? props.onBuild(action) : void refine())}
				>
					Yes, {action.type === "block" ? "set it up" : "change it"}
				</button>
			</div>
			{error && <p className="error small">{error}</p>}
		</div>
	);
}

/**
 * A file waiting in the message box, by name. No preview: an image shows in the
 * conversation once sent, served by the studio, so a picked file never goes
 * into the page as a URL of its own.
 */
function FileChip(props: { file: File; onRemove: () => void }) {
	const name = props.file.name || "pasted image";
	return (
		<span className="file-chip">
			<Icon name={props.file.type.startsWith("image/") ? "design" : "paperclip"} size={14} />
			<span className="file-name">{name}</span>
			<button
				type="button"
				className="icon-btn"
				aria-label={`Remove ${name}`}
				onClick={props.onRemove}
			>
				×
			</button>
		</span>
	);
}

/** The agent's mark beside its answers: the studio's >_, animated like the logo while it works. */
function AgentAvatar(props: { working?: boolean }) {
	return (
		<span className={`msg-avatar${props.working ? " mark working" : ""}`} aria-hidden="true">
			<span className="mark-gt">&gt;</span>
			<span className="mark-cur">_</span>
		</span>
	);
}

/** The agent at work: a spinner, a shimmering word and how long it has taken so far. */
function Thinking(props: { since: string }) {
	const start = Date.parse(props.since);
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, []);
	const seconds = Math.max(0, Math.round((now - start) / 1000));
	return (
		<div className="thinking" role="status">
			<span className="shimmer">Reading the project</span>
			{seconds >= 2 && (
				<span className="thinking-time">
					{seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}
				</span>
			)}
		</div>
	);
}

/** Grey bars where the thread's messages will be, while it loads. */
function ThreadSkeleton() {
	return (
		<>
			<li className="msg msg-user" aria-hidden="true">
				<span className="skeleton" style={{ width: 260, height: 40 }} />
			</li>
			<li className="msg msg-agent" aria-hidden="true">
				<AgentAvatar />
				<div className="msg-body">
					<span className="skeleton" style={{ width: "90%" }} />
					<span className="skeleton" style={{ width: "75%" }} />
					<span className="skeleton" style={{ width: "40%" }} />
				</div>
			</li>
		</>
	);
}

/** Ways to start, for someone who doesn't know yet what to ask. */
const STARTERS = [
	{
		icon: "design",
		title: "Build a block from a design",
		hint: "Paste a Figma or web link",
		blocks: true,
	},
	{
		icon: "paperclip",
		title: "Match a screenshot",
		hint: "Attach an image and describe it",
		text: "Make a block that looks like the attached screenshot.",
		attach: true,
	},
	{
		icon: "chat",
		title: "What's in this project?",
		hint: "The blocks it has and what they do",
		text: "Which blocks does this project have, and what is each one for?",
	},
	{
		icon: "branch",
		title: "Talk through a pull request",
		hint: "Drag one in from the side menu",
		text: "What does the attached pull request change, and what should a developer check?",
	},
] as const;

function Welcome(props: { project: Project; onStart: (s: (typeof STARTERS)[number]) => void }) {
	return (
		<li className="welcome">
			<span className="mark welcome-mark" aria-hidden="true">
				<span className="mark-gt">&gt;</span>
				<span className="mark-cur">_</span>
			</span>
			<h2>
				What should we build in <span className="nowrap">{props.project.name}</span>?
			</h2>
			<p className="muted">
				Describe it in your own words, ask about the project, or bring a design, a screenshot or a
				pull request. Nothing changes until you say yes.
			</p>
			<div className="starters">
				{STARTERS.map((s) => (
					<button key={s.title} type="button" className="starter" onClick={() => props.onStart(s)}>
						<span className="starter-icon">
							<Icon name={s.icon} size={16} />
						</span>
						<span>
							<strong>{s.title}</strong>
							<span className="muted small">{s.hint}</span>
						</span>
					</button>
				))}
			</div>
		</li>
	);
}

function Message(props: {
	project: Project;
	threadId: string;
	m: ChatMessage;
	onBuild: (a: Action) => void;
}) {
	const { m } = props;
	const body = (
		<>
			{m.images?.length ? (
				<div className="msg-images">
					{m.images.map((img) => {
						const file = img.split("/").pop() ?? "";
						const src = api.chatImage(props.project.id, props.threadId, file);
						return (
							<a key={img} href={src} target="_blank" rel="noreferrer">
								<img src={src} alt={file.replace(/^[0-9a-f]{8}-/, "")} loading="lazy" />
							</a>
						);
					})}
				</div>
			) : null}
			{m.attachments?.map((a) => (
				<span key={a} className="tag" title={a}>
					<Icon
						name={
							a.startsWith("Quote")
								? "quote"
								: a.startsWith("Thread")
									? "chat"
									: /^(Image|File) /.test(a)
										? "paperclip"
										: "branch"
						}
						size={12}
					/>{" "}
					{a.replace(/ \([0-9a-f-]{36}\)$/, "")}
				</span>
			))}
			{m.jobId ? (
				<Thinking since={m.at} />
			) : m.error ? (
				<p className="msg-error">{m.error}</p>
			) : m.role === "agent" ? (
				<Markdown text={m.text} />
			) : (
				<div className="msg-text">{m.text}</div>
			)}
			{m.queued && (
				<span className="queued">
					<span className="dot dot-running" /> Queued: the agent answers it after the current reply
				</span>
			)}
			{m.action && <ActionCard project={props.project} action={m.action} onBuild={props.onBuild} />}
		</>
	);
	return m.role === "agent" ? (
		<li className="msg msg-agent">
			<AgentAvatar working={Boolean(m.jobId)} />
			<div className="msg-body">{body}</div>
		</li>
	) : (
		<li className="msg msg-user">{body}</li>
	);
}

/** What a message carries: a pull request, a quote from a thread, or a whole thread. */
type Attachment =
	| ({ kind: "pull" } & DraggedPull)
	| { kind: "quote"; thread: string; threadTitle: string; text: string }
	| ({ kind: "thread" } & DraggedThread);

const keyOf = (a: Attachment) =>
	a.kind === "pull"
		? `pull-${a.number}`
		: a.kind === "thread"
			? `thread-${a.id}`
			: `quote-${a.thread}-${a.text}`;
const labelOf = (a: Attachment) =>
	a.kind === "pull"
		? `#${a.number} ${a.title}`
		: a.kind === "thread"
			? `Thread: ${a.title}`
			: `“${a.text.length > 60 ? `${a.text.slice(0, 57)}…` : a.text}” · ${a.threadTitle}`;

/**
 * The attachments waiting in the message box, kept per project on this computer,
 * so a quote picked in one thread can be sent from another.
 */
function useAttachments(projectId: string): [Attachment[], (next: Attachment[]) => void] {
	const key = `studio:attachments:${projectId}`;
	const [list, setList] = useState<Attachment[]>(() => {
		try {
			return JSON.parse(localStorage.getItem(key) ?? "[]") as Attachment[];
		} catch {
			return [];
		}
	});
	const save = (next: Attachment[]) => {
		setList(next);
		try {
			localStorage.setItem(key, JSON.stringify(next));
		} catch {}
	};
	return [list, save];
}

/** A floating Quote button over text selected in a message. */
function useQuote(thread: ChatThread | null, onQuote: (text: string) => void) {
	const [at, setAt] = useState<{ x: number; y: number; text: string } | null>(null);
	const onMouseUp = () => {
		const sel = window.getSelection();
		const text = sel?.toString().trim() ?? "";
		if (!thread || !sel || !text || sel.rangeCount === 0) return setAt(null);
		const r = sel.getRangeAt(0).getBoundingClientRect();
		setAt({ x: r.left + r.width / 2, y: r.top, text });
	};
	const button = at ? (
		<button
			type="button"
			className="btn btn-accent btn-sm quote-button"
			style={{ left: at.x, top: at.y }}
			onMouseDown={(e) => e.preventDefault()}
			onClick={() => {
				onQuote(at.text);
				window.getSelection()?.removeAllRanges();
				setAt(null);
			}}
		>
			Quote
		</button>
	) : null;
	return { onMouseUp, button };
}

/**
 * The project's chat: describe what you want in plain words, attach a pull
 * request or another thread by dragging it in from the side menu, quote selected text, or open the New block form.
 * Every answer comes from one read-only `eds ask` turn.
 */
export function ChatView(props: { project: Project; threadId?: string }) {
	const { project, threadId } = props;
	const [thread, setThread] = useState<ChatThread | null>(null);
	const [text, setText] = useState("");
	const [attachments, setAttachments] = useAttachments(project.id);
	// Pasted or dropped files stay in memory only: they can be large.
	const [files, setFiles] = useState<File[]>([]);
	const fileInput = useRef<HTMLInputElement>(null);
	const addFiles = (list: FileList | File[]) =>
		setFiles((f) => [...f, ...Array.from(list)].slice(0, 5));
	const [model, setModel] = useState<ModelChoice>({});
	const [showAgent, setShowAgent] = useState(false);
	// An open thread starts from the agent it last answered with; changing it applies from the next message.
	const [pickedFor, setPickedFor] = useState<string | null>(null);
	if (thread && pickedFor !== thread.id) {
		setPickedFor(thread.id);
		setModel({ agent: thread.agent as ModelChoice["agent"], model: thread.model });
	}
	const [blocks, setBlocks] = useState<{ design?: string; name?: string } | null>(null);
	const [job, setJob] = useState<Job | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const end = useRef<HTMLLIElement>(null);
	const box = useRef<HTMLTextAreaElement>(null);

	// The message box grows with the text, up to a limit, then scrolls.
	// biome-ignore lint/correctness/useExhaustiveDependencies: measure again whenever the text changes
	useLayoutEffect(() => {
		const el = box.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
	}, [text]);

	useEffect(() => {
		if (threadId) api.chat(project.id, threadId).then(setThread, (e: Error) => setError(e.message));
	}, [project.id, threadId]);

	// The agent is answering, or messages wait for it: keep reading the thread.
	const waiting = thread?.messages.some((m) => m.jobId || m.queued);
	useEffect(() => {
		if (!thread || !waiting) return;
		const t = setTimeout(() => api.chat(project.id, thread.id).then(setThread, () => {}), 1500);
		return () => clearTimeout(t);
	}, [project.id, thread, waiting]);
	// The answers on screen are seen.
	const shownId = thread?.id;
	const answeredAt = thread?.messages.findLast((m) => m.role === "agent" && !m.jobId)?.at;
	useEffect(() => {
		if (shownId && answeredAt) markSeen(project.id, shownId, answeredAt);
	}, [project.id, shownId, answeredAt]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: tell the side menu when this thread starts or stops working
	useEffect(() => {
		window.dispatchEvent(new Event(THREADS_CHANGED));
	}, [waiting]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll down when a message arrives or an answer lands
	useEffect(() => {
		end.current?.scrollIntoView({ block: "end" });
	}, [thread?.messages.length, waiting]);

	const send = async () => {
		if (!text.trim()) return;
		setBusy(true);
		setError("");
		try {
			const r = await api.sendChat(project.id, {
				thread: thread?.id,
				text,
				pulls: attachments.flatMap((a) => (a.kind === "pull" ? [a.number] : [])),
				quotes: attachments.flatMap((a) =>
					a.kind === "quote" ? [{ thread: a.thread, text: a.text }] : [],
				),
				threads: attachments.flatMap((a) => (a.kind === "thread" ? [a.id] : [])),
				files: await Promise.all(
					files.map(async (f) => ({ name: f.name || "pasted.png", data: await toBase64(f) })),
				),
				...model,
			});
			setText("");
			setAttachments([]);
			setFiles([]);
			if (thread) setThread(await api.chat(project.id, r.thread.id));
			else {
				// A new thread gets its own address and shows up in the side menu.
				window.dispatchEvent(new Event(THREADS_CHANGED));
				location.hash = href.thread(project.id, r.thread.id);
			}
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	const attach = (a: Attachment) => {
		if (!attachments.some((x) => keyOf(x) === keyOf(a))) setAttachments([...attachments, a]);
	};
	const drop = (e: DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const pull = e.dataTransfer.getData(PULL_DRAG_TYPE);
		if (pull) attach({ kind: "pull", ...(JSON.parse(pull) as DraggedPull) });
		const other = e.dataTransfer.getData(THREAD_DRAG_TYPE);
		if (other) attach({ kind: "thread", ...(JSON.parse(other) as DraggedThread) });
		if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
	};
	const quote = useQuote(thread, (text) =>
		attach({ kind: "quote", thread: thread?.id ?? "", threadTitle: thread?.title ?? "", text }),
	);

	const start = (s: (typeof STARTERS)[number]) => {
		if ("blocks" in s) return setBlocks({});
		setText(s.text);
		if ("attach" in s) fileInput.current?.click();
		box.current?.focus();
	};

	return (
		<div className="chat">
			{quote.button}
			<section className="chat-main panel">
				<div className="chat-head">
					{threadId && !thread ? (
						<span className="skeleton" style={{ width: 180 }} />
					) : (
						<strong>{thread?.title ?? "New thread"}</strong>
					)}
					{thread && (
						<a className="btn btn-ghost btn-sm push-right" href={href.project(project.id)}>
							<Icon name="plus" size={14} /> New thread
						</a>
					)}
				</div>

				<ol
					className={`chat-log${threadId ? "" : " chat-log-new"}`}
					onMouseUp={quote.onMouseUp}
					aria-busy={Boolean(threadId && !thread)}
				>
					{!threadId && !blocks && <Welcome project={project} onStart={start} />}
					{threadId && !thread && !error && <ThreadSkeleton />}
					{thread?.messages.map((m) => (
						<Message
							key={`${m.role}-${m.at}-${m.jobId ?? ""}`}
							project={project}
							threadId={thread.id}
							m={m}
							onBuild={(a) => setBlocks({ design: a.design, name: a.name })}
						/>
					))}
					<li ref={end} aria-hidden="true" />
				</ol>

				{blocks && (
					<div className="chat-blocks">
						<div className="chat-blocks-head">
							<span className="eyebrow">
								<Icon name="design" size={13} /> New block from a design
							</span>
							<button
								type="button"
								className="btn btn-ghost btn-sm"
								onClick={() => setBlocks(null)}
							>
								Close
							</button>
						</div>
						<NewDraft
							key={`${blocks.design}-${blocks.name}`}
							project={project}
							initial={blocks}
							onStarted={setJob}
						/>
						{job && (
							<JobLog
								job={job}
								title="New draft"
								onEnd={(_ended, events) => {
									const d = events.find((e) => e.type === "draft");
									if (d) location.hash = href.draft(project.id, String(d.name));
								}}
							/>
						)}
					</div>
				)}

				<form
					className={`composer${dragOver ? " drag-over" : ""}`}
					onSubmit={(e) => {
						e.preventDefault();
						void send();
					}}
					onDragOver={(e) => {
						const types = e.dataTransfer.types;
						if (
							types.includes(PULL_DRAG_TYPE) ||
							types.includes(THREAD_DRAG_TYPE) ||
							types.includes("Files")
						) {
							e.preventDefault();
							setDragOver(true);
						}
					}}
					onDragLeave={() => setDragOver(false)}
					onDrop={drop}
				>
					{attachments.length > 0 && (
						<div className="row composer-attachments">
							{attachments.map((a) => (
								<span key={keyOf(a)} className="tag">
									<Icon
										name={a.kind === "pull" ? "branch" : a.kind === "thread" ? "chat" : "quote"}
										size={12}
									/>{" "}
									{labelOf(a)}
									<button
										type="button"
										className="icon-btn"
										aria-label={`Remove ${labelOf(a)}`}
										onClick={() => setAttachments(attachments.filter((x) => keyOf(x) !== keyOf(a)))}
									>
										×
									</button>
								</span>
							))}
						</div>
					)}
					{files.length > 0 && (
						<div className="row composer-files">
							{files.map((f, i) => (
								<FileChip
									key={`${f.name}-${f.size}-${f.lastModified}`}
									file={f}
									onRemove={() => setFiles(files.filter((_, j) => j !== i))}
								/>
							))}
						</div>
					)}
					{dragOver && (
						<div className="drop-hint" aria-hidden="true">
							<Icon name="paperclip" size={16} /> Drop to attach
						</div>
					)}
					<textarea
						ref={box}
						onPaste={(e) => {
							if (e.clipboardData.files.length) {
								e.preventDefault();
								addFiles(e.clipboardData.files);
							}
						}}
						rows={2}
						placeholder="Describe what you want, or ask about the project…"
						aria-label="Message"
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								void send();
							}
						}}
					/>
					{showAgent && (
						<ModelPicker
							value={model}
							onChange={setModel}
							defaultLabel={
								project.model?.agent ? `Project default (${project.model.agent})` : undefined
							}
						/>
					)}
					<div className="row composer-foot">
						<button
							type="button"
							className={`btn btn-outline btn-sm${blocks ? " on" : ""}`}
							onClick={() => setBlocks(blocks ? null : {})}
						>
							<Icon name="design" size={14} /> Blocks
						</button>
						<button
							type="button"
							className="btn btn-ghost btn-sm"
							aria-label="Attach images or files"
							title="Attach images or files (or paste, or drop them here)"
							onClick={() => fileInput.current?.click()}
						>
							<Icon name="paperclip" size={14} />
						</button>
						<input
							ref={fileInput}
							type="file"
							multiple
							hidden
							accept="image/*,.txt,.md,.json,.csv,.html,.css,.js,.ts,.tsx,.jsx,.yaml,.yml,.xml"
							onChange={(e) => {
								if (e.target.files) addFiles(e.target.files);
								e.target.value = "";
							}}
						/>
						<button
							type="button"
							className="btn btn-ghost btn-sm"
							title="The agent that answers the next message"
							onClick={() => setShowAgent((s) => !s)}
						>
							Agent: {model.agent ?? project.model?.agent ?? "default"}
							{model.model ? ` · ${model.model}` : ""}
						</button>
						<span className="composer-hint push-right" aria-hidden="true">
							<kbd>Enter</kbd> send <kbd>Shift Enter</kbd> new line
						</span>
						<button
							type="submit"
							className="send-btn"
							aria-label={busy ? "Sending" : "Send"}
							title="Send"
							disabled={busy || !text.trim()}
						>
							{busy ? (
								<span className="spinner spinner-ink" aria-hidden="true" />
							) : (
								<Icon name="send" size={16} />
							)}
						</button>
					</div>
					{error && <p className="msg-error small">{error}</p>}
				</form>
			</section>
		</div>
	);
}
