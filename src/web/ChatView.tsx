import { type DragEvent, useEffect, useRef, useState } from "react";
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
import { ModelPicker } from "./ModelPicker.js";
import { NewDraft } from "./ProjectView.js";
import { type DraggedPull, PULL_DRAG_TYPE } from "./PullsPanel.js";
import { href } from "./router.js";
import { type DraggedThread, THREAD_DRAG_TYPE, THREADS_CHANGED } from "./ThreadLinks.js";

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

/** The agent's text with `inline code` shown as code; everything else stays plain text. */
function Rich(props: { text: string }) {
	return (
		<div className="msg-text">
			{props.text.split(/(`[^`\n]+`)/).map((part, i) =>
				/^`[^`]+`$/.test(part) ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: the parts never move
					<code key={i}>{part.slice(1, -1)}</code>
				) : (
					part
				),
			)}
		</div>
	);
}

function Message(props: { project: Project; m: ChatMessage; onBuild: (a: Action) => void }) {
	const { m } = props;
	return (
		<li className={`msg msg-${m.role}`}>
			{m.attachments?.map((a) => (
				<span key={a} className="tag" title={a}>
					<Icon
						name={a.startsWith("Quote") ? "quote" : a.startsWith("Thread") ? "chat" : "branch"}
						size={12}
					/>{" "}
					{a.replace(/ \([0-9a-f-]{36}\)$/, "")}
				</span>
			))}
			{m.jobId ? (
				<p className="muted">
					<span className="dot dot-running" /> Thinking…
				</p>
			) : m.error ? (
				<p className="error">{m.error}</p>
			) : (
				<Rich text={m.text} />
			)}
			{m.action && <ActionCard project={props.project} action={m.action} onBuild={props.onBuild} />}
		</li>
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
	const [model, setModel] = useState<ModelChoice>({});
	const [showAgent, setShowAgent] = useState(false);
	const [blocks, setBlocks] = useState<{ design?: string; name?: string } | null>(null);
	const [job, setJob] = useState<Job | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const end = useRef<HTMLLIElement>(null);

	useEffect(() => {
		if (threadId) api.chat(project.id, threadId).then(setThread, (e: Error) => setError(e.message));
	}, [project.id, threadId]);

	// While the agent answers, read the thread again until the answer is in.
	const waiting = thread?.messages.some((m) => m.jobId);
	useEffect(() => {
		if (!thread || !waiting) return;
		const t = setTimeout(() => api.chat(project.id, thread.id).then(setThread, () => {}), 1500);
		return () => clearTimeout(t);
	}, [project.id, thread, waiting]);
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
				...(thread ? {} : model),
			});
			setText("");
			setAttachments([]);
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
	};
	const quote = useQuote(thread, (text) =>
		attach({ kind: "quote", thread: thread?.id ?? "", threadTitle: thread?.title ?? "", text }),
	);

	return (
		<div className="chat">
			{quote.button}
			<section className="chat-main panel">
				<div className="chat-head">
					<strong>{thread?.title ?? "New thread"}</strong>
					{thread && (
						<a className="btn btn-ghost btn-sm push-right" href={href.project(project.id)}>
							<Icon name="plus" size={14} /> New thread
						</a>
					)}
				</div>

				<ol className="chat-log" onMouseUp={quote.onMouseUp}>
					{!thread && (
						<li className="chat-empty muted">
							Describe what you want, e.g. “a hero like this design, with two buttons”, ask about
							the project, or drag a pull request here from the side menu. To start from a design
							right away, use <strong>Blocks</strong>.
						</li>
					)}
					{thread?.messages.map((m) => (
						<Message
							key={`${m.role}-${m.at}-${m.jobId ?? ""}`}
							project={project}
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
						if (types.includes(PULL_DRAG_TYPE) || types.includes(THREAD_DRAG_TYPE)) {
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
					<textarea
						rows={3}
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
					{showAgent && !thread && (
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
						{!thread && (
							<button
								type="button"
								className="btn btn-ghost btn-sm"
								onClick={() => setShowAgent((s) => !s)}
							>
								Agent: {model.agent ?? project.model?.agent ?? "default"}
							</button>
						)}
						<button
							type="submit"
							className="btn btn-accent btn-sm push-right"
							disabled={busy || !text.trim() || !!waiting}
						>
							<Icon name="send" size={14} /> Send
						</button>
					</div>
					{error && <p className="error small">{error}</p>}
				</form>
			</section>
		</div>
	);
}
