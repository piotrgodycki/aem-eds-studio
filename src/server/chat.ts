import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pullForChat } from "./github.js";
import { type Job, startJob, waitForJob } from "./jobs.js";
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
	action?: ChatAction;
	/** The turn failed: the agent's error instead of an answer. */
	error?: string;
}

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

export async function listThreads(projectId: string) {
	return (await readThreads(projectId))
		.map(({ messages, ...t }) => ({ ...t, messages: messages.length }))
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getThread(projectId: string, id: string): Promise<Thread | undefined> {
	return (await readThreads(projectId)).find((t) => t.id === id);
}

export async function deleteThread(projectId: string, id: string) {
	await update(projectId, (threads) => {
		const i = threads.findIndex((t) => t.id === id);
		if (i >= 0) threads.splice(i, 1);
	});
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
	repo?: string | null;
	agent?: string;
	model?: string;
}

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

/** The pull requests, quotes and threads a message carries, as `eds ask` attachments. */
async function attachmentsFor(o: SendOptions): Promise<Array<{ title: string; text: string }>> {
	const pulls = o.repo
		? await Promise.all((o.pulls ?? []).map((n) => pullForChat(o.repo as string, n)))
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
	return [...pulls, ...quotes, ...threads];
}

/** Append the user's message, start its `eds ask` turn, and save the answer when it ends. */
export async function sendMessage(o: SendOptions): Promise<{ thread: Thread; job: Job }> {
	const attachments = await attachmentsFor(o);
	const now = new Date().toISOString();
	const thread = await update(o.projectId, (threads) => {
		let t = threads.find((x) => x.id === o.threadId);
		if (!t) {
			t = {
				id: randomUUID(),
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
			...(attachments.length ? { attachments: attachments.map((a) => a.title) } : {}),
		});
		t.updatedAt = now;
		return structuredClone(t);
	});

	// The conversation so far goes in a file eds reads (--input): it can be long.
	const input = path.join(studioHome(), "tmp", `ask-${randomUUID()}.json`);
	await mkdir(path.dirname(input), { recursive: true });
	await writeFile(
		input,
		JSON.stringify({
			message: o.text,
			history: thread.messages
				.slice(0, -1)
				.filter((m) => !m.error && m.text)
				.map((m) => ({ role: m.role, text: m.text })),
			attachments,
		}),
	);
	const agent = o.agent ?? thread.agent;
	const model = o.model ?? thread.model;
	const job = await startJob({
		projectId: o.projectId,
		cwd: o.cwd,
		kind: "chat",
		args: [
			"ask",
			"--input",
			input,
			...(agent ? ["--agent", agent] : []),
			...(model ? ["--model", model] : []),
		],
	});
	await update(o.projectId, (threads) => {
		const t = threads.find((x) => x.id === thread.id);
		t?.messages.push({ role: "agent", text: "", at: now, jobId: job.id });
	});

	void waitForJob(job.id).then(async (done) => {
		await rm(input, { force: true });
		const answer = done.events.find((e) => e.type === "answer") as
			| { text?: string; action?: ChatAction }
			| undefined;
		const error = done.events
			.filter((e) => e.type === "log" && (e as { level?: string }).level === "error")
			.map((e) => String((e as { message?: string }).message))
			.join("\n");
		await update(o.projectId, (threads) => {
			const m = threads.find((x) => x.id === thread.id)?.messages.find((x) => x.jobId === job.id);
			if (!m) return;
			m.jobId = undefined;
			m.at = new Date().toISOString();
			if (answer?.text !== undefined) {
				m.text = answer.text;
				if (answer.action) m.action = answer.action;
			} else m.error = error || "The agent didn't answer.";
		});
	});
	return { thread, job };
}
