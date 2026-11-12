import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { authState, cancelAuth, sendAuthCode, startAuth } from "./agent-auth.js";
import { NotConnected, fetchBoard } from "./board.js";
import { type EdsEvent, MIN_EDS_VERSION, resolveEds } from "./eds.js";
import { deviceFlowState, signOut, startDeviceFlow } from "./github-auth.js";
import { githubStatus, listRepos, repoFromGit } from "./github.js";
import {
	type Job,
	followJob,
	getJob,
	listJobs,
	startJob,
	stopJob,
	waitForEvent,
	waitForJob,
} from "./jobs.js";
import {
	type Project,
	addGithubProject,
	addLocalProject,
	exportSettings,
	getProject,
	importSettings,
	parseSettings,
	readProjects,
	removeProject,
	updateProject,
} from "./projects.js";
import { readSettings, updateSettings } from "./settings.js";
import * as v from "./validate.js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

const reserved = new Set<number>();

/** A free TCP port on 127.0.0.1 for a preview server. */
export function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.unref();
		srv.on("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const addr = srv.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			srv.close(() => {
				// Two previews starting at once must not get the same port.
				if (reserved.has(port)) return void freePort().then(resolve, reject);
				reserved.add(port);
				resolve(port);
			});
		});
	});
}
/** Give a preview's port back when its job ends. */
export const releasePort = (port: number) => reserved.delete(port);

const blockLock = (projectId: string, name: string) => [`project:${projectId}:block:${name}`];
const projectLock = (projectId: string) => [`project:${projectId}`];

/** Agent and model flags for a job: the request's, else the project's default. */
function modelArgs(project: Project, body: Record<string, unknown>): string[] {
	const agent = v.agent(body.agent) ?? project.model?.agent;
	const model = v.model(body.model) ?? project.model?.model;
	return [...(agent ? ["--agent", agent] : []), ...(model ? ["--model", model] : [])];
}

export function createApp(opts: { webDir?: string } = {}) {
	const app = new Hono();
	// One preview per project: starting another stops the previous one.
	const previews = new Map<string, string>();

	// Local-only guard. The server listens on 127.0.0.1, but a web page in the
	// user's browser could still try to reach it (DNS rebinding, cross-site
	// form posts), so only our own host and origin get through, and writes
	// must be JSON.
	app.use("*", async (c, next) => {
		const host = (c.req.header("host") ?? "").replace(/:\d+$/, "");
		if (!LOCAL_HOSTS.has(host)) return c.text("Forbidden host", 403);
		if (c.req.method !== "GET" && c.req.method !== "HEAD") {
			const origin = c.req.header("origin");
			if (origin) {
				let ok = false;
				try {
					ok = new URL(origin).host === c.req.header("host");
				} catch {}
				if (!ok) return c.text("Forbidden origin", 403);
			}
			if (!(c.req.header("content-type") ?? "").startsWith("application/json"))
				return c.text("Expected JSON", 415);
		}
		await next();
	});

	app.onError((err, c) => {
		if (err instanceof v.InputError) return c.json({ error: err.message }, 400);
		return c.json({ error: err.message }, 500);
	});

	const body = async (c: { req: { json: () => Promise<unknown> } }) => {
		try {
			const b = await c.req.json();
			return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
		} catch {
			return {};
		}
	};

	const project = async (id: string) => {
		const p = await getProject(id);
		if (!p) throw new v.InputError("No such project.");
		return p;
	};

	app.get("/api/status", async (c) => {
		const [eds, github] = await Promise.all([
			resolveEds().then(
				(e) => ({ ok: true, version: e.version }),
				(err: Error) => ({ ok: false, error: err.message }),
			),
			githubStatus(),
		]);
		return c.json({
			eds: { ...eds, min: MIN_EDS_VERSION },
			github,
			figma: { token: !!process.env.FIGMA_TOKEN },
		});
	});

	// ── app settings and the agents eds can drive (first-run tutorial) ──
	app.get("/api/settings", async (c) => c.json(await readSettings()));
	app.patch("/api/settings", async (c) => c.json(await updateSettings(await body(c))));
	app.get("/api/agents", async (c) => {
		const job = await startJob({
			projectId: "studio",
			cwd: os.homedir(),
			kind: "agents",
			args: ["agents"],
		});
		const done = await waitForJob(job.id);
		const agents = done.events.find((e) => e.type === "agents")?.agents;
		if (!agents) return c.json({ error: jobError(done) }, 500);
		return c.json(agents);
	});

	// ── agent sign-in with the provider's own login (no terminal) ──
	app.get("/api/agents/:agent/login", (c) => c.json(authState(v.authAgent(c.req.param("agent")))));
	app.post("/api/agents/:agent/login", (c) => c.json(startAuth(v.authAgent(c.req.param("agent")))));
	app.post("/api/agents/:agent/login/code", async (c) => {
		const agent = v.authAgent(c.req.param("agent"));
		const code = v.authCode((await body(c)).code);
		try {
			return c.json(sendAuthCode(agent, code));
		} catch (err) {
			throw new v.InputError((err as Error).message);
		}
	});
	app.delete("/api/agents/:agent/login", (c) =>
		c.json(cancelAuth(v.authAgent(c.req.param("agent")))),
	);

	// ── GitHub sign-in (device flow; the token never reaches the page) ──
	const flowView = (f: ReturnType<typeof deviceFlowState>) =>
		f && {
			state: f.state,
			userCode: f.userCode,
			verificationUri: f.verificationUri,
			expiresAt: f.expiresAt,
			error: f.error,
		};
	app.post("/api/github/connect", async (c) => {
		try {
			return c.json(flowView(await startDeviceFlow()));
		} catch (err) {
			return c.json({ error: (err as Error).message }, 400);
		}
	});
	app.get("/api/github/connect", (c) => c.json(flowView(deviceFlowState())));
	app.post("/api/github/disconnect", async (c) => {
		await signOut();
		return c.json(await githubStatus());
	});

	// ── projects ──
	app.get("/api/projects", async (c) => c.json(await readProjects()));
	app.post("/api/projects", async (c) => {
		const b = await body(c);
		const p = b.repo ? await addGithubProject(v.repo(b.repo)) : await addLocalProject(b.path);
		return c.json(p, 201);
	});
	app.get("/api/projects/:id", async (c) => c.json(await project(c.req.param("id"))));
	app.patch("/api/projects/:id", async (c) => {
		const b = await body(c);
		const m = (b.model ?? {}) as Record<string, unknown>;
		return c.json(
			await updateProject(c.req.param("id"), {
				model: { agent: v.agent(m.agent), model: v.model(m.model) },
			}),
		);
	});
	app.delete("/api/projects/:id", async (c) => {
		const id = c.req.param("id");
		const prev = previews.get(id);
		if (prev) stopJob(prev);
		return c.json({ removed: await removeProject(id) });
	});
	app.get("/api/github/repos", async (c) => c.json(await listRepos()));
	const repoOf = async (p: Project) =>
		p.source.type === "github" ? p.source.repo : await repoFromGit(p.path);
	app.get("/api/projects/:id/export", async (c) => {
		const p = await project(c.req.param("id"));
		const settings = exportSettings(p, await repoOf(p));
		const file = `${p.name.replace(/[^a-z0-9._-]+/gi, "-")}.studio.json`;
		return c.json(settings, 200, { "content-disposition": `attachment; filename="${file}"` });
	});
	app.post("/api/projects/import", async (c) => {
		const { project: p, created } = await importSettings(
			parseSettings((await body(c)).settings),
			repoOf,
		);
		return c.json({ project: p, created }, created ? 201 : 200);
	});
	app.get("/api/projects/:id/board", async (c) => {
		const p = await project(c.req.param("id"));
		const repo = await repoOf(p);
		if (!repo)
			return c.json(
				{ error: "This project has no GitHub repository (no github.com origin)." },
				404,
			);
		try {
			return c.json(await fetchBoard(repo));
		} catch (err) {
			if (err instanceof NotConnected)
				return c.json({ error: err.message, repo, connect: true }, 401);
			throw err;
		}
	});

	// ── drafts ──
	app.get("/api/projects/:id/drafts", async (c) => {
		const p = await project(c.req.param("id"));
		const job = await startJob({
			projectId: p.id,
			cwd: p.path,
			kind: "list",
			args: ["draft", "list"],
		});
		const done = await waitForJob(job.id);
		const drafts = done.events.find((e) => e.type === "drafts")?.drafts;
		if (!drafts) return c.json({ error: jobError(done) }, 500);
		return c.json(drafts);
	});

	app.post("/api/projects/:id/drafts", async (c) => {
		const p = await project(c.req.param("id"));
		const b = await body(c);
		const name = v.blockName(b.name);
		const design = v.design(b.design);
		const args = [
			"block",
			"from-design",
			...(design === "sample" ? ["--sample"] : [design]),
			"--name",
			name,
			"--draft",
			...v.sourceArgs(design, b.source, !!process.env.FIGMA_TOKEN),
			...modelArgs(p, b),
		];
		const job = await startJob({
			projectId: p.id,
			cwd: p.path,
			kind: "new draft",
			block: name,
			args,
			locks: blockLock(p.id, name),
		});
		return c.json(job, 202);
	});

	app.post("/api/projects/:id/drafts/:name/refine", async (c) => {
		const p = await project(c.req.param("id"));
		const name = v.blockName(c.req.param("name"));
		const b = await body(c);
		const fb = v.feedback(b.feedback);
		const ver = v.version(b.version);
		// `--` ends the options, so a comment can never be read as a flag.
		const args = [
			"draft",
			"refine",
			...(ver ? ["--from", String(ver)] : []),
			...modelArgs(p, b),
			"--",
			name,
			fb,
		];
		const job = await startJob({
			projectId: p.id,
			cwd: p.path,
			kind: "change",
			block: name,
			args,
			locks: blockLock(p.id, name),
		});
		return c.json(job, 202);
	});

	app.post("/api/projects/:id/drafts/:name/preview", async (c) => {
		const p = await project(c.req.param("id"));
		const name = v.blockName(c.req.param("name"));
		const ver = v.version((await body(c)).version);
		const prev = previews.get(p.id);
		if (prev) stopJob(prev);
		const port = await freePort();
		const job = await startJob({
			projectId: p.id,
			cwd: p.path,
			kind: "preview",
			args: [
				"draft",
				"preview",
				name,
				...(ver ? [String(ver)] : []),
				"--no-open",
				"--port",
				String(port),
			],
			timeoutMs: null,
		});
		previews.set(p.id, job.id);
		void waitForJob(job.id).then(() => releasePort(port));
		const ev = await waitForEvent(job.id, "preview");
		if (!ev) return c.json({ error: jobError(getJob(job.id) ?? job) }, 500);
		return c.json({ jobId: job.id, url: ev.url, version: ev.version });
	});

	app.post("/api/projects/:id/drafts/:name/accept", async (c) => {
		const p = await project(c.req.param("id"));
		const name = v.blockName(c.req.param("name"));
		const b = await body(c);
		const ver = v.version(b.version);
		const br = b.branch ? v.branch(b.branch) : undefined;
		const args = [
			"draft",
			"accept",
			name,
			...(ver ? [String(ver)] : []),
			...(br ? ["--branch", br] : b.commit ? ["--commit"] : []),
		];
		const job = await startJob({
			projectId: p.id,
			cwd: p.path,
			kind: "accept",
			block: name,
			args,
			locks: projectLock(p.id),
		});
		const done = await waitForJob(job.id);
		const accepted = done.events.find((e) => e.type === "accepted");
		if (!accepted) return c.json({ error: jobError(done) }, 500);
		return c.json({
			...accepted,
			ok: done.status === "done",
			error: done.status === "done" ? undefined : jobError(done),
		});
	});

	app.post("/api/projects/:id/drafts/:name/discard", async (c) => {
		const p = await project(c.req.param("id"));
		const name = v.blockName(c.req.param("name"));
		const job = await startJob({
			projectId: p.id,
			cwd: p.path,
			kind: "discard",
			block: name,
			args: ["draft", "discard", name],
			locks: blockLock(p.id, name),
		});
		const done = await waitForJob(job.id);
		if (done.status !== "done") return c.json({ error: jobError(done) }, 500);
		return c.json({ discarded: name });
	});

	// ── jobs ──
	app.get("/api/projects/:id/jobs", (c) => c.json(listJobs(c.req.param("id"))));
	// Every project's live jobs, for the header: what runs and what waits.
	app.get("/api/jobs", async (c) => {
		const names = new Map((await readProjects()).map((p) => [p.id, p.name]));
		return c.json(
			listJobs()
				.filter((j) => j.status === "running" || j.status === "queued")
				.filter((j) => j.kind !== "preview" && j.kind !== "list")
				.map((j) => ({
					...j,
					project: names.get(j.projectId) ?? j.projectId,
					events: [],
					stderr: [],
				})),
		);
	});
	app.get("/api/jobs/:id", (c) => {
		const job = getJob(c.req.param("id"));
		return job ? c.json(job) : c.json({ error: "No such job." }, 404);
	});
	app.post("/api/jobs/:id/stop", (c) => c.json({ stopped: stopJob(c.req.param("id")) }));
	app.get("/api/jobs/:id/events", (c) => {
		const id = c.req.param("id");
		if (!getJob(id)) return c.json({ error: "No such job." }, 404);
		return streamSSE(c, async (stream) => {
			await new Promise<void>((resolve) => {
				const queue: Array<{ event: string; data: string }> = [];
				let writing = false;
				let ended = false;
				const flush = async () => {
					if (writing) return;
					writing = true;
					while (queue.length) {
						const m = queue.shift();
						if (m) await stream.writeSSE(m);
					}
					writing = false;
					if (ended) resolve();
				};
				const off = followJob(
					id,
					(e: EdsEvent) => {
						queue.push({ event: "eds", data: JSON.stringify(e) });
						void flush();
					},
					(job) => {
						queue.push({ event: "end", data: JSON.stringify(job) });
						ended = true;
						void flush();
					},
				);
				stream.onAbort(() => {
					off?.();
					resolve();
				});
			});
		});
	});

	// ── the UI ──
	const webDir = opts.webDir ?? defaultWebDir();
	app.get("*", async (c) => {
		if (!webDir) return c.text("The UI isn't built: run npm run build.", 404);
		const rel = decodeURIComponent(new URL(c.req.url).pathname).replace(/^\/+/, "");
		let file = path.resolve(webDir, rel || "index.html");
		if (!insideDir(webDir, file) || !existsSync(file) || !path.extname(file))
			file = path.join(webDir, "index.html");
		const type = MIME[path.extname(file)] ?? "application/octet-stream";
		return c.body(await readFile(file), 200, { "content-type": type, ...UI_HEADERS });
	});

	return app;
}

const MIME: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".json": "application/json",
	".ico": "image/x-icon",
};

/** `file` is `dir` itself or under it (a sibling such as `web-other/` is not). */
export function insideDir(dir: string, file: string): boolean {
	const rel = path.relative(path.resolve(dir), path.resolve(file));
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * The UI's own code only: scripts and connections to this server, styles
 * inline for React, images from GitHub (board screenshots), and frames from
 * the local block preview (`eds block preview` on localhost).
 */
export const CSP = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: https:",
	"font-src 'self' data:",
	"connect-src 'self'",
	"frame-src http://localhost:* http://127.0.0.1:*",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'self'",
	"frame-ancestors 'none'",
].join("; ");

const UI_HEADERS = {
	"content-security-policy": CSP,
	"x-content-type-options": "nosniff",
	"referrer-policy": "no-referrer",
};

function defaultWebDir(): string | undefined {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const dir = path.resolve(here, "..", "web");
	return existsSync(path.join(dir, "index.html")) ? dir : undefined;
}

/** The most useful error text from a failed job: its last error log, else stderr. */
export function jobError(job: Job): string {
	const err = job.events.findLast((e) => e.type === "log" && e.level === "error");
	if (err && typeof err.message === "string") return err.message;
	const tail = job.stderr.filter((l) => l.trim()).at(-1);
	return tail ?? `eds exited with code ${job.exitCode ?? "?"}`;
}
