import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import readline from "node:readline";
import { type EdsEvent, resolveEds } from "./eds.js";

export type JobStatus = "running" | "done" | "failed" | "stopped";

export interface Job {
	id: string;
	projectId: string;
	/** What the job does, for the UI: "new draft", "change", "preview", … */
	kind: string;
	/** The `eds` arguments (after `--json`), shown in the log. */
	args: string[];
	status: JobStatus;
	startedAt: string;
	endedAt?: string;
	events: EdsEvent[];
	/** The last lines the CLI printed on stderr, for when something fails before any event. */
	stderr: string[];
	exitCode?: number | null;
}

interface Running {
	job: Job;
	child: ChildProcess;
	bus: EventEmitter;
	timer?: NodeJS.Timeout;
}

const MAX_STDERR_LINES = 200;
/** A generation round that runs longer than this is stopped. */
export const JOB_TIMEOUT_MS = 20 * 60 * 1000;

const jobs = new Map<string, Running>();

export interface StartOptions {
	projectId: string;
	cwd: string;
	kind: string;
	args: string[];
	/** Extra environment (secrets go here, never into `args`). */
	env?: Record<string, string>;
	/** Long-running jobs (preview) are not timed out. */
	timeoutMs?: number | null;
}

/** Spawn `eds --json <args>` in the project and collect its events. */
export async function startJob(opts: StartOptions): Promise<Job> {
	const eds = await resolveEds();
	const job: Job = {
		id: randomUUID(),
		projectId: opts.projectId,
		kind: opts.kind,
		args: opts.args,
		status: "running",
		startedAt: new Date().toISOString(),
		events: [],
		stderr: [],
	};
	const child = spawn(eds.file, [...eds.prefix, "--json", "--no-color", ...opts.args], {
		cwd: opts.cwd,
		env: { ...process.env, ...opts.env, NO_COLOR: "1", FORCE_COLOR: "0" },
		stdio: ["ignore", "pipe", "pipe"],
		shell: false,
	});
	const bus = new EventEmitter();
	const running: Running = { job, child, bus };
	jobs.set(job.id, running);

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
		running.timer = setTimeout(() => {
			job.stderr.push(`Stopped after ${Math.round(timeout / 60000)} minutes.`);
			child.kill("SIGTERM");
		}, timeout);
	}

	child.on("error", (err) => {
		job.stderr.push(err.message);
	});
	child.on("close", (code) => {
		clearTimeout(running.timer);
		job.exitCode = code;
		job.endedAt = new Date().toISOString();
		const result = job.events.findLast((e) => e.type === "result");
		if (job.status !== "stopped")
			job.status = result?.ok === true && code === 0 ? "done" : "failed";
		bus.emit("end", job);
	});
	return job;
}

export function getJob(id: string): Job | undefined {
	return jobs.get(id)?.job;
}

export function listJobs(projectId: string): Job[] {
	return [...jobs.values()].map((r) => r.job).filter((j) => j.projectId === projectId);
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
	if (r.job.status !== "running") {
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
	if (!r || r.job.status !== "running") return false;
	r.job.status = "stopped";
	r.child.kill("SIGTERM");
	return true;
}

/** Stop every running job (the studio is shutting down). */
export function stopAll(): void {
	for (const r of jobs.values()) if (r.job.status === "running") r.child.kill("SIGTERM");
}
