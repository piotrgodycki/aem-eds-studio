import { type DragEvent, useCallback, useEffect, useRef, useState } from "react";
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

type Summary = Awaited<ReturnType<typeof api.chats>>[number];
type Action = NonNullable<ChatMessage["action"]>;

const TIME = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** The conversations kept for this project, newest first. */
function ThreadList(props: {
	threads: Summary[];
	current?: string;
	onPick: (id: string) => void;
	onDelete: (id: string) => void;
}) {
	if (!props.threads.length) return <p className="muted small">No conversations yet.</p>;
	return (
		<ul className="thread-list">
			{props.threads.map((t) => (
				<li key={t.id} className={t.id === props.current ? "on" : ""}>
					<button type="button" onClick={() => props.onPick(t.id)}>
						<span className="thread-title">{t.title}</span>
						<span className="muted small">{TIME.format(new Date(t.updatedAt))}</span>
					</button>
					<button
						type="button"
						className="icon-btn"
						aria-label={`Delete the conversation “${t.title}”`}
						title="Delete conversation"
						onClick={() => props.onDelete(t.id)}
					>
						<Icon name="trash" size={14} />
					</button>
				</li>
			))}
		</ul>
	);
}

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
				<span key={a} className="tag">
					<Icon name="branch" size={12} /> {a}
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

/**
 * The project's chat: describe what you want in plain words, attach a pull
 * request by dragging it in from the sidebar, or open the New block form.
 * Every answer comes from one read-only `eds ask` turn.
 */
export function ChatView(props: { project: Project }) {
	const { project } = props;
	const [threads, setThreads] = useState<Summary[]>([]);
	const [thread, setThread] = useState<ChatThread | null>(null);
	const [showHistory, setShowHistory] = useState(false);
	const [text, setText] = useState("");
	const [pulls, setPulls] = useState<DraggedPull[]>([]);
	const [model, setModel] = useState<ModelChoice>({});
	const [showAgent, setShowAgent] = useState(false);
	const [blocks, setBlocks] = useState<{ design?: string; name?: string } | null>(null);
	const [job, setJob] = useState<Job | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const end = useRef<HTMLLIElement>(null);

	const loadThreads = useCallback(
		() => api.chats(project.id).then(setThreads, () => {}),
		[project.id],
	);
	useEffect(() => {
		void loadThreads();
	}, [loadThreads]);

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

	const newThread = () => {
		setThread(null);
		setModel({}); // a new conversation starts with the project's default agent again
		setPulls([]);
		setShowHistory(false);
	};
	const send = async () => {
		if (!text.trim()) return;
		setBusy(true);
		setError("");
		try {
			const r = await api.sendChat(project.id, {
				thread: thread?.id,
				text,
				pulls: pulls.map((p) => p.number),
				...(thread ? {} : model),
			});
			setText("");
			setPulls([]);
			setThread(await api.chat(project.id, r.thread.id));
			void loadThreads();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	const drop = (e: DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const raw = e.dataTransfer.getData(PULL_DRAG_TYPE);
		if (!raw) return;
		const pr = JSON.parse(raw) as DraggedPull;
		setPulls((list) => (list.some((p) => p.number === pr.number) ? list : [...list, pr]));
	};

	return (
		<div className={`chat${showHistory ? " chat-history-open" : ""}`}>
			<aside className="chat-history" aria-label="Conversations">
				<button type="button" className="btn btn-outline btn-sm" onClick={newThread}>
					<Icon name="plus" size={14} /> New conversation
				</button>
				<ThreadList
					threads={threads}
					current={thread?.id}
					onPick={(id) => {
						void api.chat(project.id, id).then(setThread);
						setShowHistory(false);
					}}
					onDelete={async (id) => {
						await api.deleteChat(project.id, id);
						if (thread?.id === id) setThread(null);
						void loadThreads();
					}}
				/>
			</aside>

			<section className="chat-main panel">
				<div className="chat-head">
					<button
						type="button"
						className="btn btn-ghost btn-icon chat-history-toggle"
						aria-label="Show conversations"
						aria-expanded={showHistory}
						title="Conversations"
						onClick={() => setShowHistory((s) => !s)}
					>
						<Icon name="history" size={18} />
					</button>
					<strong>{thread?.title ?? "New conversation"}</strong>
				</div>

				<ol className="chat-log">
					{!thread && (
						<li className="chat-empty muted">
							Describe what you want, e.g. “a hero like this design, with two buttons”, ask about
							the project, or drag a pull request here from the sidebar. To start from a design
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
						if (e.dataTransfer.types.includes(PULL_DRAG_TYPE)) {
							e.preventDefault();
							setDragOver(true);
						}
					}}
					onDragLeave={() => setDragOver(false)}
					onDrop={drop}
				>
					{pulls.length > 0 && (
						<div className="row composer-attachments">
							{pulls.map((p) => (
								<span key={p.number} className="tag">
									<Icon name="branch" size={12} /> #{p.number} {p.title}
									<button
										type="button"
										className="icon-btn"
										aria-label={`Remove pull request #${p.number}`}
										onClick={() => setPulls((l) => l.filter((x) => x.number !== p.number))}
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
