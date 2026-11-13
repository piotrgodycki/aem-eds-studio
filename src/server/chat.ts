import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { issueForChat, pullForChat } from "./github.js";
import { getJob, type Job, startJob, waitForJob } from "./jobs.js";
import { studioHome } from "./paths.js";

/**
 * The project's chat. The studio keeps the threads; each message is one
 * `eds ask` turn (aem-eds-kit 0.4.81+), which keeps the agent read-only and
 * inside the project. The earlier turns and attachments go in with it, since
 * eds keeps no conversation. An action the agent proposes is only shown: the
 * page runs it after the user says yes.
 */

export interface ChatAction {
	type: "block" | "refine";
	name: string;
	design?: string;
	feedback?: string;
}

export interface ChatMessage {
	role: "user" | "agent";
	text: string;
	at: string;
	/** What went along with a user's message, e.g. "PR #14 Hero block". */
	attachments?: string[];
	/** The `eds ask` job answering this message, while it runs. */
	jobId?: string;
	/** Sent while the agent was busy: answered together with the others, in the next turn. */
	queued?: boolean;
	/** Images attached to the message, by their path in the project (for the page to show). */
	images?: string[];
	/** A queued message's attachments, kept until its turn starts. */
	pending?: Attachment[];
	action?: ChatAction;
	/**
	 * The developer said yes in words to the proposal before this answer: that
	 * action, and the job it started (a change runs at once; a new block opens
	 * its form in the page).
	 */
	confirmed?: { action: ChatAction; jobId?: string };
	/** The turn failed: the agent's error instead of an answer. */
	error?: string;
}

type Attachment = { title: string; text: string };

export interface Thread {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	agent?: string;
	model?: string;
	messages: ChatMessage[];
}

const file = (projectId: string) => path.join(studioHome(), "chats", `${projectId}.json`);

async function readThreads(projectId: string): Promise<Thread[]> {
	if (!existsSync(file(projectId))) return [];
	try {
		return JSON.parse(await readFile(file(projectId), "utf-8")) as Thread[];
	} catch {
		return [];
	}
}

async function writeThreads(projectId: string, threads: Thread[]) {
	await mkdir(path.dirname(file(projectId)), { recursive: true });
	const tmp = `${file(projectId)}.${process.pid}.tmp`;
	await writeFile(tmp, `${JSON.stringify(threads, null, 2)}\n`);
	await rename(tmp, file(projectId));
}

/** Writes to one project's threads one at a time, so two answers never overwrite each other. */
const queues = new Map<string, Promise<unknown>>();
function update<T>(projectId: string, change: (threads: Thread[]) => T): Promise<T> {
	const next = (queues.get(projectId) ?? Promise.resolve()).then(async () => {
		const threads = await readThreads(projectId);
		const result = change(threads);
		await writeThreads(projectId, threads);
		return result;
	});
	queues.set(
		projectId,
		next.catch(() => {}),
	);
	return next;
}

/**
 * The threads for the side menu, newest first. `working` says the agent is
 * answering or messages wait for it; `answeredAt` is when its latest answer
 * landed, so the page can mark one the user hasn't seen yet.
 */
export async function listThreads(projectId: string) {
	return (await readThreads(projectId))
		.map(({ messages, ...t }) => ({
			...t,
			messages: messages.length,
			working: messages.some((m) => m.jobId || m.queued),
			answeredAt: messages.findLast((m) => m.role === "agent" && !m.jobId)?.at,
		}))
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** A thread for the page: waiting attachments stay here (a diff can be long). */
export async function getThread(projectId: string, id: string): Promise<Thread | undefined> {
	const t = (await readThreads(projectId)).find((x) => x.id === id);
	return t && { ...t, messages: t.messages.map(({ pending, ...m }) => m) };
}

/**
 * A turn whose job this studio no longer knows (it was closed meanwhile) won't
 * answer: say so, so the thread doesn't wait for it forever.
 */
function dropLostTurns(t: Thread) {
	for (const m of t.messages)
		if (m.jobId && m.jobId !== "starting" && !getJob(m.jobId)) {
			m.jobId = undefined;
			m.error = "The studio was closed before the agent answered. Send the message again.";
		}
}

/** Forget a thread, and the files attached in it (they live in the project's tmp/). */
export async function deleteThread(projectId: string, cwd: string, id: string) {
	await update(projectId, (threads) => {
		const i = threads.findIndex((t) => t.id === id);
		if (i >= 0) threads.splice(i, 1);
	});
	await rm(path.join(cwd, chatFilesDir(id)), { recursive: true, force: true });
}

export interface SendOptions {
	projectId: string;
	cwd: string;
	threadId?: string;
	text: string;
	/** Pull request numbers dragged into the message. */
	pulls?: number[];
	/** Text quoted from a message in this or another thread. */
	quotes?: Array<{ thread: string; text: string }>;
	/** Other threads the message refers to: their conversation goes along. */
	threads?: string[];
	/** Drafts and blocks in the project the message points at with @. */
	drafts?: string[];
	blocks?: string[];
	/** GitHub issues (from the work board) the message points at. */
	issues?: number[];
	/** Agent work (jobs) the message points at: its log goes along. */
	jobs?: string[];
	/** Images and text files pasted or dropped into the message. */
	files?: Array<{ name: string; kind: "image" | "text"; bytes: Buffer }>;
	repo?: string | null;
	agent?: string;
	model?: string;
	/** Runs a proposal the developer accepted in words; returns its job, if it started one. */
	runAccepted?: Runner;
}

type Runner = (action: ChatAction) => Promise<string | undefined>;

/** The first words of the first message, as the thread's title. */
function titleOf(text: string): string {
	const line = text.trim().split("\n")[0];
	return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}

/** How much of a referred thread goes along: its latest turns, up to this many characters. */
const THREAD_LIMIT = 20_000;

/** A thread as context for another: its title and conversation. */
function threadContext(t: Thread): { title: string; text: string } {
	let text = "";
	for (const m of [...t.messages].reverse()) {
		if (!m.text) continue;
		const line = `${m.role === "user" ? "Developer" : "Agent"}: ${m.text}\n\n`;
		if (text.length + line.length > THREAD_LIMIT) break;
		text = line + text;
	}
	return { title: `Thread “${t.title}” (${t.id})`, text: text.trim() };
}

/** Where a thread's files go: inside the project, where the agent may read them. */
export const chatFilesDir = (threadId: string) => path.join("tmp", "eds-cli", "chat", threadId);

/** Text a file attachment carries at most; the agent can read the rest from the project. */
const TEXT_FILE_LIMIT = 100_000;

/**
 * Save the message's files in the project and describe them for the agent: a
 * text file goes in as text; an image as its path, which the agent reads with
 * its file tool (a local model gets the name only: it can't see images here).
 */
async function saveFiles(
	cwd: string,
	threadId: string,
	files: NonNullable<SendOptions["files"]>,
): Promise<{ attachments: Attachment[]; images: string[] }> {
	const attachments: Attachment[] = [];
	const images: string[] = [];
	for (const f of files) {
		const rel = path.join(
			chatFilesDir(threadId),
			`${randomUUID().slice(0, 8)}-${f.name.replace(/[^\w.-]+/g, "_")}`,
		);
		await mkdir(path.join(cwd, path.dirname(rel)), { recursive: true });
		await writeFile(path.join(cwd, rel), f.bytes);
		const where = rel.split(path.sep).join("/");
		if (f.kind === "image") {
			images.push(where);
			attachments.push({
				title: `Image ${f.name}`,
				text: `The developer attached an image, saved in the project at ${where}. Read that file to see it.`,
			});
		} else {
			const text = f.bytes.toString("utf-8");
			attachments.push({
				title: `File ${f.name}`,
				text:
					text.length > TEXT_FILE_LIMIT
						? `${text.slice(0, TEXT_FILE_LIMIT)}\n… (cut; the whole file is at ${where})`
						: text,
			});
		}
	}
	return { attachments, images };
}

/** How much of a job's log goes along: its last lines, up to this many characters. */
const JOB_LOG_LIMIT = 12_000;

/** Agent work as context: what it was, how it ended, and the end of its log. */
function jobContext(job: Job): { title: string; text: string } {
	const lines = job.events
		.map((e) =>
			typeof e.message === "string" ? e.message : typeof e.text === "string" ? e.text : "",
		)
		.filter(Boolean);
	let log = "";
	for (const line of [...lines, ...job.stderr].reverse()) {
		if (log.length + line.length > JOB_LOG_LIMIT) break;
		log = `${line}\n${log}`;
	}
	const what = [job.kind, job.block].filter(Boolean).join(" ");
	return {
		title: `Agent work: ${what} (${job.status})`,
		text: [
			`eds ${job.args.join(" ")}`,
			`Started ${job.startedAt}${job.endedAt ? `, ended ${job.endedAt}` : ""}, ${job.status}.`,
			"Its log, last lines:",
			log.trim() || "(nothing logged)",
		].join("\n"),
	};
}

/**
 * Drafts and blocks go along as where to look, not their files: the agent may
 * read the project, and a draft's rounds and comments sit next to its versions.
 */
const draftContext = (name: string) => ({
	title: `Draft ${name}`,
	text: `The developer points at the draft "${name}". Its review rounds and comments are in tmp/eds-cli/drafts/${name}/draft.json; each version's files are in tmp/eds-cli/drafts/${name}/v<N>/ (the highest N is the latest). Read what you need.`,
});
const blockContext = (name: string) => ({
	title: `Block ${name}`,
	text: `The developer points at the block "${name}", whose files are in blocks/${name}/. Read what you need.`,
});

/** The pull requests, quotes, threads and @ references a message carries, as `eds ask` attachments. */
async function attachmentsFor(o: SendOptions): Promise<Array<{ title: string; text: string }>> {
	const pulls = o.repo
		? await Promise.all((o.pulls ?? []).map((n) => pullForChat(o.repo as string, n)))
		: [];
	const issues = o.repo
		? await Promise.all((o.issues ?? []).map((n) => issueForChat(o.repo as string, n)))
		: [];
	const all = await readThreads(o.projectId);
	const titleOfThread = (id: string) => all.find((t) => t.id === id)?.title ?? "a deleted thread";
	const quotes = (o.quotes ?? []).map((q) => ({
		title: `Quote from “${titleOfThread(q.thread)}” (${q.thread})`,
		text: q.text,
	}));
	const threads = (o.threads ?? []).flatMap((id) => {
		const t = all.find((x) => x.id === id);
		return t ? [threadContext(t)] : [];
	});
	const jobs = (o.jobs ?? []).flatMap((id) => {
		const job = getJob(id);
		return job && job.projectId === o.projectId ? [jobContext(job)] : [];
	});
	return [
		...pulls,
		...issues,
		...quotes,
		...threads,
		...(o.drafts ?? []).map(draftContext),
		...(o.blocks ?? []).map(blockContext),
		...jobs,
	];
}

/**
 * Append the user's message and answer it. While the agent is still answering
 * an earlier message, the new one waits: when that turn ends, every waiting
 * message goes to the agent together, in one turn.
 */
export async function sendMessage(o: SendOptions): Promise<{ thread: Thread; job: Job | null }> {
	const threadId = o.threadId ?? randomUUID();
	const saved = await saveFiles(o.cwd, threadId, o.files ?? []);
	const attachments = [...(await attachmentsFor(o)), ...saved.attachments];
	const now = new Date().toISOString();
	const id = await update(o.projectId, (threads) => {
		let t = threads.find((x) => x.id === threadId);
		if (!t) {
			t = {
				id: threadId,
				title: titleOf(o.text),
				createdAt: now,
				updatedAt: now,
				agent: o.agent,
				model: o.model,
				messages: [],
			};
			threads.push(t);
		}
		t.messages.push({
			role: "user",
			text: o.text,
			at: now,
			queued: true,
			...(saved.images.length ? { images: saved.images } : {}),
			...(attachments.length
				? { attachments: attachments.map((a) => a.title), pending: attachments }
				: {}),
		});
		// The agent picked for this message answers from now on; none means the project's default.
		t.agent = o.agent;
		t.model = o.model;
		t.updatedAt = now;
		return t.id;
	});
	const job = await startTurn(o.projectId, o.cwd, id, o.runAccepted);
	return { thread: (await getThread(o.projectId, id)) as Thread, job };
}

/** Start the agent on the thread's waiting messages, unless it is still answering. */
async function startTurn(
	projectId: string,
	cwd: string,
	threadId: string,
	runAccepted?: Runner,
): Promise<Job | null> {
	const turn = await update(projectId, (threads) => {
		const t = threads.find((x) => x.id === threadId);
		if (!t) return null;
		dropLostTurns(t);
		if (t.messages.some((m) => m.jobId)) return null;
		const waiting = t.messages.filter((m) => m.queued);
		if (!waiting.length) return null;
		const first = t.messages.indexOf(waiting[0]);
		const history = t.messages
			.slice(0, first)
			.filter((m) => !m.error && m.text)
			.map((m) => ({ role: m.role, text: m.text }));
		const attachments = waiting.flatMap((m) => m.pending ?? []);
		// The proposal under the answer just before these messages still waits for a yes.
		const before = t.messages[first - 1];
		const pending = before?.role === "agent" && before.action ? before.action : undefined;
		for (const m of waiting) {
			m.queued = undefined;
			m.pending = undefined;
		}
		// Taken now, so a second message arriving meanwhile waits for this turn.
		t.messages.push({ role: "agent", text: "", at: new Date().toISOString(), jobId: "starting" });
		return {
			message: waiting.map((m) => m.text).join("\n\n"),
			history,
			attachments,
			pending,
			agent: t.agent,
			model: t.model,
		};
	});
	if (!turn) return null;

	// The conversation so far goes in a file eds reads (--input): it can be long.
	const input = path.join(studioHome(), "tmp", `ask-${randomUUID()}.json`);
	await mkdir(path.dirname(input), { recursive: true });
	await writeFile(
		input,
		JSON.stringify({
			message: turn.message,
			history: turn.history,
			attachments: turn.attachments,
			...(turn.pending ? { pending: turn.pending } : {}),
		}),
	);
	const job = await startJob({
		projectId,
		cwd,
		kind: "chat",
		args: [
			"ask",
			"--input",
			input,
			...(turn.agent ? ["--agent", turn.agent] : []),
			...(turn.model ? ["--model", turn.model] : []),
		],
	});
	await update(projectId, (threads) => {
		const m = threads.find((x) => x.id === threadId)?.messages.find((x) => x.jobId === "starting");
		if (m) m.jobId = job.id;
	});

	void waitForJob(job.id).then(async (done) => {
		await rm(input, { force: true });
		const answer = done.events.find((e) => e.type === "answer") as
			| { text?: string; action?: ChatAction; accepts?: boolean }
			| undefined;
		// A yes in words runs exactly the proposal that waited for it, never a new one.
		const confirmed =
			answer?.accepts && turn.pending
				? { action: turn.pending, jobId: await runAccepted?.(turn.pending).catch(() => undefined) }
				: undefined;
		const error = done.events
			.filter((e) => e.type === "log" && (e as { level?: string }).level === "error")
			.map((e) => String((e as { message?: string }).message))
			.join("\n");
		await update(projectId, (threads) => {
			const m = threads.find((x) => x.id === threadId)?.messages.find((x) => x.jobId === job.id);
			if (!m) return;
			m.jobId = undefined;
			m.at = new Date().toISOString();
			if (answer?.text !== undefined) {
				m.text = answer.text;
				if (answer.action) m.action = answer.action;
				if (confirmed) m.confirmed = confirmed;
			} else m.error = error || "The agent didn't answer.";
		});
		// Messages sent while this turn ran are next.
		await startTurn(projectId, cwd, threadId, runAccepted);
	});
	return job;
}
