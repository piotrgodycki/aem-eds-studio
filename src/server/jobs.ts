import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import readline from "node:readline";
import { type EdsEvent, resolveEds } from "./eds.js";

export type JobStatus = "queued" | "running" | "done" | "failed" | "stopped";

export interface Job {
	id: string;
	projectId: string;
	/** What the job does, for the UI: "new draft", "change", "preview", … */
	kind: string;
	/** The block it works on, if any (shown in the jobs list). */
	block?: string;
	/** The `eds` arguments (after `--json`), shown in the log. */
	args: string[];
	status: JobStatus;
	/** Set while queued: what it waits for. */
	waitingFor?: string;
	startedAt: string;
	endedAt?: string;
	events: EdsEvent[];
	/** The last lines the CLI printed on stderr, for when something fails before any event. */
	stderr: string[];
	exitCode?: number | null;
}

interface Running {
	job: Job;
	child?: ChildProcess;
	bus: EventEmitter;
	timer?: NodeJS.Timeout;
	opts: StartOptions;
	locks: string[];
}

const MAX_STDERR_LINES = 200;
/** A generation round that runs longer than this is stopped. */
export const JOB_TIMEOUT_MS = 20 * 60 * 1000;

const jobs = new Map<string, Running>();
const queue: Running[] = [];
const held = new Map<string, string>(); // lock → job id
/** The CLI the last job ran with, so a freed lock starts the next job right away. */
let lastEds: Awaited<ReturnType<typeof resolveEds>> | undefined;

export interface StartOptions {
	projectId: string;
	cwd: string;
	kind: string;
	args: string[];
	block?: string;
	/**
	 * What the job must have to itself. `project:<id>` (git work: accept)
	 * excludes every lock in that project; `project:<id>:block:<name>`
	 * (generate, change, discard) excludes only that block. Different
	 * projects never wait for each other.
	 */
	locks?: string[];
	/** Extra environment (secrets go here, never into `args`). */
	env?: Record<string, string>;
	/** Long-running jobs (preview) are not timed out. */
	timeoutMs?: number | null;
}

/** The lock that makes `lock` wait, if any. */
export function conflict(lock: string, taken: Iterable<string>): string | undefined {
	for (const t of taken)
		if (t === lock || t.startsWith(`${lock}:`) || lock.startsWith(`${t}:`)) return t;
	return undefined;
}

const describe = (lock: string) => {
	const m = lock.match(/^project:[^:]+(?::block:(.+))?$/);
	return m?.[1] ? `block "${m[1]}" is busy` : "the project is busy (git)";
};

/** Spawn `eds --json <args>` in the project now, or queue it until its locks are free. */
export async function startJob(opts: StartOptions): Promise<Job> {
	const eds = await resolveEds(); // fail fast, before queueing
	lastEds = eds;
	const job: Job = {
		id: randomUUID(),
		projectId: opts.projectId,
		kind: opts.kind,
		block: opts.block,
		args: opts.args,
		status: "queued",
		startedAt: new Date().toISOString(),
		events: [],
		stderr: [],
	};
	const r: Running = { job, bus: new EventEmitter(), opts, locks: opts.locks ?? [] };
	jobs.set(job.id, r);
	// First come, first served: a job also waits for queued jobs it conflicts with,
	// so block jobs can't keep overtaking a waiting accept.
	const waiting = queue.flatMap((q) => q.locks);
	const blocked = r.locks.map((l) => conflict(l, [...held.keys(), ...waiting])).find(Boolean);
	if (blocked) {
		job.waitingFor = describe(blocked);
		queue.push(r);
	} else launch(r, eds.file, eds.prefix, eds.env);
	return job;
}

function launch(r: Running, file: string, prefix: string[], edsEnv: Record<string, string>) {
	const { job, opts, bus } = r;
	for (const l of r.locks) held.set(l, job.id);
	job.status = "running";
	job.waitingFor = undefined;
	job.startedAt = new Date().toISOString();
	bus.emit("start", job);
	const child = spawn(file, [...prefix, "--json", "--no-color", ...opts.args], {
		cwd: opts.cwd,
		env: { ...process.env, ...edsEnv, ...opts.env, NO_COLOR: "1", FORCE_COLOR: "0" },
		stdio: ["ignore", "pipe", "pipe"],
		shell: false,
	});
	r.child = child;

	readline.createInterface({ input: child.stdout }).on("line", (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		let event: EdsEvent;
		try {
			event = JSON.parse(trimmed) as EdsEvent;
		} catch {
			return; // not part of the stream
		}
		job.events.push(event);
		bus.emit("event", event);
	});
	readline.createInterface({ input: child.stderr }).on("line", (line) => {
		job.stderr.push(line);
		if (job.stderr.length > MAX_STDERR_LINES) job.stderr.shift();
	});

	const timeout = opts.timeoutMs === undefined ? JOB_TIMEOUT_MS : opts.timeoutMs;
	if (timeout) {
		r.timer = setTimeout(() => {
			job.stderr.push(`Stopped after ${Math.round(timeout / 60000)} minutes.`);
			child.kill("SIGTERM");
		}, timeout);
	}

	child.on("error", (err) => {
		job.stderr.push(err.message);
	});
	child.on("close", (code) => {
		clearTimeout(r.timer);
		job.exitCode = code;
		job.endedAt = new Date().toISOString();
		const result = job.events.findLast((e) => e.type === "result");
		if (job.status !== "stopped")
			job.status = result?.ok === true && code === 0 ? "done" : "failed";
		for (const l of r.locks) if (held.get(l) === job.id) held.delete(l);
		drain(); // before "end", so whoever waited on this job sees the next one running
		bus.emit("end", job);
	});
}

/** Start every queued job whose locks are now free, in order. */
function drain() {
	if (!queue.length) return;
	const eds = lastEds;
	const ahead: string[] = []; // locks of jobs still waiting before this one
	for (let i = 0; i < queue.length; ) {
		const r = queue[i];
		const blocked = r.locks.map((l) => conflict(l, [...held.keys(), ...ahead])).find(Boolean);
		if (blocked || !eds) {
			if (blocked) r.job.waitingFor = describe(blocked);
			ahead.push(...r.locks);
			i++;
			continue;
		}
		queue.splice(i, 1);
		launch(r, eds.file, eds.prefix, eds.env);
	}
}

export function getJob(id: string): Job | undefined {
	return jobs.get(id)?.job;
}

export function listJobs(projectId?: string): Job[] {
	return [...jobs.values()]
		.map((r) => r.job)
		.filter((j) => !projectId || j.projectId === projectId);
}

/** Follow a job: replays what already happened, then streams. Returns the unsubscribe. */
export function followJob(
	id: string,
	onEvent: (e: EdsEvent) => void,
	onEnd: (job: Job) => void,
): (() => void) | undefined {
	const r = jobs.get(id);
	if (!r) return undefined;
	for (const e of r.job.events) onEvent(e);
	if (r.job.status !== "running" && r.job.status !== "queued") {
		onEnd(r.job);
		return () => {};
	}
	r.bus.on("event", onEvent);
	r.bus.once("end", onEnd);
	return () => {
		r.bus.off("event", onEvent);
		r.bus.off("end", onEnd);
	};
}

/** Wait until the job ends. */
export function waitForJob(id: string): Promise<Job> {
	return new Promise((resolve, reject) => {
		const off = followJob(
			id,
			() => {},
			(job) => resolve(job),
		);
		if (!off) reject(new Error(`No job ${id}`));
	});
}

/** Wait for the first event of a type (e.g. `preview` with its URL), or the job's end. */
export function waitForEvent(id: string, type: string): Promise<EdsEvent | null> {
	return new Promise((resolve) => {
		// followJob replays past events synchronously, before it returns `off`.
		const sub: { off?: () => void; done: boolean } = { done: false };
		const finish = (v: EdsEvent | null) => {
			if (sub.done) return;
			sub.done = true;
			queueMicrotask(() => sub.off?.());
			resolve(v);
		};
		sub.off = followJob(
			id,
			(e) => e.type === type && finish(e),
			() => finish(null),
		);
		if (!sub.off) finish(null);
	});
}

export function stopJob(id: string): boolean {
	const r = jobs.get(id);
	if (!r) return false;
	if (r.job.status === "queued") {
		queue.splice(queue.indexOf(r), 1);
		r.job.status = "stopped";
		r.job.endedAt = new Date().toISOString();
		r.bus.emit("end", r.job);
		return true;
	}
	if (r.job.status !== "running") return false;
	r.job.status = "stopped";
	r.child?.kill("SIGTERM");
	return true;
}

/** Stop every running and queued job (the studio is shutting down). */
export function stopAll(): void {
	queue.length = 0;
	for (const r of jobs.values()) if (r.job.status === "running") r.child?.kill("SIGTERM");
}
