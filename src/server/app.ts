import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { authState, cancelAuth, sendAuthCode, startAuth } from "./agent-auth.js";
import { fetchBoard, NotConnected } from "./board.js";
import { chatFilesDir, deleteThread, getThread, listThreads, sendMessage } from "./chat.js";
import {
	createPairCode,
	DEVICE_COOKIE,
	deviceFor,
	listDevices,
	networkAddresses,
	networkPort,
	pairDevice,
	revokeDevice,
} from "./devices.js";
import { type EdsEvent, MIN_EDS_VERSION, resolveEds } from "./eds.js";
import { clearFigmaToken, figmaToken, figmaTokenStatus, saveFigmaToken } from "./figma-token.js";
import {
	collaborators,
	defaultBranch,
	githubStatus,
	listPulls,
	listRepos,
	openPull,
	pullForBranch,
	repoFromGit,
	repoRole,
	saveGithubToken,
} from "./github.js";
import { deviceFlowState, signOut, startDeviceFlow } from "./github-auth.js";
import { projectHistory } from "./history.js";
import {
	followJob,
	getJob,
	type Job,
	listJobs,
	startJob,
	stopJob,
	waitForEvent,
	waitForJob,
} from "./jobs.js";
import {
	addGithubProject,
	addLocalProject,
	exportSettings,
	getProject,
	importSettings,
	type Project,
	parseSettings,
	readProjects,
	removeProject,
	updateProject,
} from "./projects.js";
import { pullBody, type Shot } from "./pull-text.js";
import { isOn, readSettings, updateSettings } from "./settings.js";
import { type AgentInfo, setupChecks } from "./setup.js";
import { setTailscaleServe, tailscaleState } from "./tailscale.js";
import { readUsage, summarize } from "./usage.js";
import * as v from "./validate.js";

/** Chat images the page may show. SVG is left out: it can carry scripts. */
const IMAGE_TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
};

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * What a paired device may do over the network: read, chat, and start or
 * change a draft (the yes to a proposal). Settings, tokens, projects, accepting
 * into the repository and managing devices stay on the computer.
 */
const DEVICE_ROUTES: Array<[method: string, path: RegExp]> = [
	["GET", /^\/api\/(status|settings|agents|setup|usage|projects|jobs|device)$/],
	["GET", /^\/api\/projects\/[^/]+(\/(board|blocks|chats|drafts|history|pulls|jobs|role))?$/],
	["GET", /^\/api\/projects\/[^/]+\/chats\/[^/]+(\/files\/[^/]+)?$/],
	["GET", /^\/api\/projects\/[^/]+\/drafts\/[^/]+\/pull$/],
	["GET", /^\/api\/jobs\/[^/]+(\/events)?$/],
	["POST", /^\/api\/projects\/[^/]+\/(chats|drafts)$/],
	["POST", /^\/api\/projects\/[^/]+\/drafts\/[^/]+\/(refine|preview)$/],
	["POST", /^\/api\/jobs\/[^/]+\/stop$/],
	["DELETE", /^\/api\/projects\/[^/]+\/chats\/[^/]+$/],
];
const deviceMayCall = (method: string, path: string) =>
	DEVICE_ROUTES.some(
		([m, re]) => (m === method || (m === "GET" && method === "HEAD")) && re.test(path),
	);

/** A request that came in on the network listener (start.ts passes `remote` in its env). */
const fromNetwork = (env: unknown) => (env as { remote?: boolean } | undefined)?.remote === true;

/**
 * The host and scheme the device used. Behind `tailscale serve` (a proxy on
 * this computer) they arrive as X-Forwarded-*; those headers are believed only
 * from a loopback peer, so a device can't claim another origin.
 */
function seenBy(c: { env: unknown; req: { header: (name: string) => string | undefined } }) {
	const peer = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
		?.incoming?.socket?.remoteAddress;
	const proxied =
		fromNetwork(c.env) && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer ?? "");
	return {
		host: (proxied && c.req.header("x-forwarded-host")) || c.req.header("host"),
		https: proxied && c.req.header("x-forwarded-proto") === "https",
	};
}

function cookie(header: string | undefined, name: string): string | undefined {
	for (const part of (header ?? "").split(";")) {
		const [k, ...v] = part.trim().split("=");
		if (k === name) return v.join("=");
	}
	return undefined;
}

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

/** The agents `eds agents` reports; throws the job's error when it fails. */
async function listAgents(): Promise<AgentInfo[]> {
	const job = await startJob({
		projectId: "studio",
		cwd: os.homedir(),
		kind: "agents",
		args: ["agents"],
	});
	const done = await waitForJob(job.id);
	const agents = done.events.find((e) => e.type === "agents")?.agents;
	if (!agents) throw new Error(jobError(done));
	return agents as AgentInfo[];
}

export function createApp(
	opts: {
		webDir?: string;
		/** Start or stop the network listener when Network access is switched. */
		onNetworkAccess?: (on: boolean) => Promise<void>;
	} = {},
) {
	const app = new Hono();
	// One preview per project: starting another stops the previous one.
	const previews = new Map<string, string>();

	// Local-only guard. The server listens on 127.0.0.1, but a web page in the
	// user's browser could still try to reach it (DNS rebinding, cross-site
	// form posts), so only our own host and origin get through, and writes
	// must be JSON.
	// On the network listener the host is this computer's address, so the
	// paired device's token is the guard instead: it rides in a SameSite=Strict
	// cookie for that address, which another site's page never gets to send.
	app.use("*", async (c, next) => {
		const remote = fromNetwork(c.env);
		const host = (c.req.header("host") ?? "").replace(/:\d+$/, "");
		if (!remote && !LOCAL_HOSTS.has(host)) return c.text("Forbidden host", 403);
		if (c.req.method !== "GET" && c.req.method !== "HEAD") {
			const origin = c.req.header("origin");
			if (origin) {
				let ok = false;
				try {
					ok = new URL(origin).host === seenBy(c).host;
				} catch {}
				if (!ok) return c.text("Forbidden origin", 403);
			}
			if (!(c.req.header("content-type") ?? "").startsWith("application/json"))
				return c.text("Expected JSON", 415);
		}
		if (remote && c.req.path.startsWith("/api/") && c.req.path !== "/api/pair") {
			if (!(await deviceFor(cookie(c.req.header("cookie"), DEVICE_COOKIE))))
				return c.json({ error: "Pair this device with the studio first." }, 401);
			if (!deviceMayCall(c.req.method, c.req.path))
				return c.json({ error: "This works only on the computer running the studio." }, 403);
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
			figma: { token: !!(await figmaToken()) },
		});
	});

	// ── app settings and the agents eds can drive (first-run tutorial) ──
	app.get("/api/settings", async (c) => c.json(await readSettings()));
	// The Figma token is write-only from the page: it can be saved or removed, never read back.
	app.get("/api/settings/figma", async (c) => c.json(await figmaTokenStatus()));
	app.put("/api/settings/figma", async (c) => {
		await saveFigmaToken(v.figmaToken((await body(c)).token));
		return c.json(await figmaTokenStatus());
	});
	app.delete("/api/settings/figma", async (c) => {
		await clearFigmaToken();
		return c.json(await figmaTokenStatus());
	});
	app.patch("/api/settings", async (c) => {
		const before = (await readSettings()).networkAccess === true;
		const next = await updateSettings(await body(c));
		const after = next.networkAccess === true;
		if (after !== before) await opts.onNetworkAccess?.(after);
		return c.json(next);
	});

	// ── network access: devices pair here, and are managed from the computer ──
	app.get("/api/network", async (c) =>
		c.json({
			on: (await readSettings()).networkAccess === true,
			port: networkPort(),
			addresses: networkAddresses(),
			devices: await listDevices(),
			tailscale: await tailscaleState(networkPort()),
		}),
	);
	// HTTPS through Tailscale: its link comes first, the plain addresses after it.
	app.post("/api/network/pair-code", async (c) => {
		const { code, expiresAt } = createPairCode();
		const ts = await tailscaleState(networkPort());
		const links = [
			...(ts.serving ? [`https://${ts.httpsName}/#/pair/${code}`] : []),
			...networkAddresses().map((a) => `http://${a}:${networkPort()}/#/pair/${code}`),
		];
		return c.json({ code, expiresAt, links });
	});
	app.post("/api/network/tailscale", async (c) => {
		await setTailscaleServe((await body(c)).on === true, networkPort());
		return c.json(await tailscaleState(networkPort()));
	});
	app.delete("/api/network/devices/:id", async (c) =>
		c.json({ revoked: await revokeDevice(c.req.param("id")) }),
	);
	// Which paired device the page runs on; none on the computer itself.
	app.get("/api/device", async (c) =>
		c.json({
			device: fromNetwork(c.env)
				? ((await deviceFor(cookie(c.req.header("cookie"), DEVICE_COOKIE))) ?? null)
				: null,
		}),
	);
	// A device trades its one-time code for its own token, kept in an HttpOnly cookie.
	app.post("/api/pair", async (c) => {
		const b = await body(c);
		const paired = await pairDevice(b.code, b.name);
		if (!paired) return c.json({ error: "That pairing code is wrong or has expired." }, 403);
		const secure = new URL(c.req.url).protocol === "https:" || seenBy(c).https;
		c.header(
			"set-cookie",
			`${DEVICE_COOKIE}=${paired.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure ? "; Secure" : ""}`,
		);
		return c.json({ device: paired.device });
	});
	app.get("/api/agents", async (c) => c.json(await listAgents()));
	app.get("/api/setup", async (c) => c.json(await setupChecks(listAgents)));

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
	// A token pasted in Settings: checked with GitHub, then kept in the keychain; never read back.
	app.put("/api/github/token", async (c) =>
		c.json(await saveGithubToken(v.githubToken((await body(c)).token))),
	);
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
	// ── chat: threads kept here, each message one read-only `eds ask` turn ──
	app.get("/api/projects/:id/chats", async (c) => c.json(await listThreads(c.req.param("id"))));
	app.get("/api/projects/:id/chats/:thread", async (c) => {
		const t = await getThread(c.req.param("id"), c.req.param("thread"));
		return t ? c.json(t) : c.json({ error: "No such conversation." }, 404);
	});
	// An image attached in the chat, for the page to show; only from the thread's own folder.
	app.get("/api/projects/:id/chats/:thread/files/:file", async (c) => {
		const p = await project(c.req.param("id"));
		const name = c.req.param("file");
		if (!/^[\w.-]+$/.test(name) || name.startsWith("."))
			return c.json({ error: "No such file." }, 404);
		const file = path.join(p.path, chatFilesDir(v.id(c.req.param("thread"))), name);
		if (!existsSync(file)) return c.json({ error: "No such file." }, 404);
		const type = IMAGE_TYPES[path.extname(name).toLowerCase()];
		if (!type) return c.json({ error: "No such file." }, 404);
		return c.body(await readFile(file), 200, {
			"content-type": type,
			"x-content-type-options": "nosniff",
		});
	});
	app.delete("/api/projects/:id/chats/:thread", async (c) => {
		const p = await project(c.req.param("id"));
		await deleteThread(p.id, p.path, v.id(c.req.param("thread")));
		return c.json({ deleted: true });
	});
	app.post("/api/projects/:id/chats", async (c) => {
		const p = await project(c.req.param("id"));
		const b = await body(c);
		const pulls = v.pullNumbers(b.pulls);
		const issues = v.issueNumbers(b.issues);
		const sent = await sendMessage({
			projectId: p.id,
			cwd: p.path,
			threadId: b.thread === undefined ? undefined : v.id(b.thread),
			text: v.chatText(b.text),
			pulls,
			quotes: v.quotes(b.quotes),
			threads: v.threadIds(b.threads),
			drafts: v.blockNames(b.drafts),
			blocks: v.blockNames(b.blocks),
			issues,
			jobs: v.jobIds(b.jobs),
			files: v.chatFiles(b.files),
			repo: pulls.length || issues.length ? await repoOf(p) : null,
			agent: v.agent(b.agent),
			model: v.model(b.model),
			// A yes in words to a change starts it here; a new block's form opens in the page.
			runAccepted: async (a) =>
				a.type === "refine" && a.feedback
					? (await startRefine(p, v.blockName(a.name), v.feedback(a.feedback))).id
					: undefined,
		});
		return c.json(sent, 202);
	});

	// The blocks in the project's blocks/ folder, for @ in the chat.
	app.get("/api/projects/:id/blocks", async (c) => {
		const p = await project(c.req.param("id"));
		const dir = path.join(p.path, "blocks");
		const entries = existsSync(dir) ? await readdir(dir, { withFileTypes: true }) : [];
		return c.json(
			entries
				.filter((e) => e.isDirectory() && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.name))
				.map((e) => e.name)
				.sort(),
		);
	});

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
		const exported = isExport(b.source) ? await saveExport(p.path, name, b.export) : undefined;
		const figma = await figmaEnv();
		const args = [
			"block",
			"from-design",
			...(design === "sample" ? ["--sample"] : [exported ?? design]),
			"--name",
			name,
			"--draft",
			// A GitHub project keeps each version on draft/<name>, with its aem.page preview.
			...((await repoOf(p)) ? ["--push"] : []),
			...v.sourceArgs(design, b.source, !!figma.FIGMA_TOKEN),
			...modelArgs(p, b),
		];
		const job = await startJob({
			projectId: p.id,
			cwd: p.path,
			kind: "new draft",
			block: name,
			args,
			locks: blockLock(p.id, name),
			env: figma,
		});
		return c.json(job, 202);
	});

	/** One more agent round on a draft (or a block in blocks/): the next version. */
	const startRefine = async (
		p: Project,
		name: string,
		feedback: string,
		b: Record<string, unknown> = {},
	) => {
		const ver = v.version(b.version);
		// `--` ends the options, so a comment can never be read as a flag.
		const args = [
			"draft",
			"refine",
			...(ver ? ["--from", String(ver)] : []),
			...((await repoOf(p)) ? ["--push"] : []),
			...modelArgs(p, b),
			"--",
			name,
			feedback,
		];
		return startJob({
			projectId: p.id,
			cwd: p.path,
			kind: "change",
			block: name,
			args,
			locks: blockLock(p.id, name),
			env: await figmaEnv(),
		});
	};

	app.post("/api/projects/:id/drafts/:name/refine", async (c) => {
		const p = await project(c.req.param("id"));
		const name = v.blockName(c.req.param("name"));
		const b = await body(c);
		return c.json(await startRefine(p, name, v.feedback(b.feedback), b), 202);
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
		// A GitHub project accepts on the draft's branch and opens a pull request from it;
		// a local folder commits into blocks/ on a branch of its own.
		const repo = await repoOf(p);
		const br = !repo && b.branch ? v.branch(b.branch) : undefined;
		const args = [
			"draft",
			"accept",
			name,
			...(ver ? [String(ver)] : []),
			...(repo ? ["--on-branch"] : br ? ["--branch", br] : b.commit ? ["--commit"] : []),
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

	// The step after accepting a branch draft: a pull request from draft/<name>, with the
	// review rounds (from eds draft list) as its description.
	/**
	 * The accepted version's screenshots (eds draft shot --push), committed on
	 * the draft's branch: one image per breakpoint, linked from the pull
	 * request. Without a browser for them, the pull request opens anyway.
	 */
	/** The pull request's title and English description, written by the agent (eds draft describe). */
	const describeDraft = async (p: Project, name: string, version: number) => {
		const job = await startJob({
			projectId: p.id,
			cwd: p.path,
			kind: "describe",
			block: name,
			args: ["draft", "describe", name, String(version), ...modelArgs(p, {})],
		});
		const done = await waitForJob(job.id);
		return done.events.find((e) => e.type === "description") as
			| { title: string; body: string }
			| undefined;
	};

	const screenshotsOnBranch = async (
		p: Project,
		repo: string,
		name: string,
		version: number,
	): Promise<{ list?: Shot[]; error?: string }> => {
		const job = await startJob({
			projectId: p.id,
			cwd: p.path,
			kind: "screenshots",
			block: name,
			args: ["draft", "shot", name, String(version), "--push"],
			locks: blockLock(p.id, name),
		});
		const done = await waitForJob(job.id);
		const shots = done.events.find((e) => e.type === "shots") as
			| { files: string[]; widths: number[] }
			| undefined;
		const pushed = done.events.find((e) => e.type === "pushed") as { commit?: string } | undefined;
		if (!shots?.files.length || !pushed?.commit) return { error: jobError(done) };
		const commit = pushed.commit;
		return {
			list: shots.files.map((file, i) => ({
				width: shots.widths[i],
				url: `https://github.com/${repo}/blob/${commit}/blocks/${name}/${file}?raw=true`,
			})),
		};
	};

	app.post("/api/projects/:id/drafts/:name/pull", async (c) => {
		const p = await project(c.req.param("id"));
		const name = v.blockName(c.req.param("name"));
		const reviewers = v.logins((await body(c)).reviewers);
		const repo = await repoOf(p);
		if (!repo) return c.json({ error: "Pull requests need a project on GitHub." }, 400);
		const job = await startJob({
			projectId: p.id,
			cwd: p.path,
			kind: "list",
			args: ["draft", "list"],
		});
		const done = await waitForJob(job.id);
		const drafts = done.events.find((e) => e.type === "drafts")?.drafts as
			| Array<{
					name: string;
					branch?: string;
					accepted?: { version: number };
					versions: Array<{ version: number; feedback?: string }>;
			  }>
			| undefined;
		const draft = drafts?.find((d) => d.name === name);
		if (!draft?.accepted || !draft.branch)
			return c.json({ error: `Accept the draft "${name}" first.` }, 400);
		const version = draft.accepted.version;
		const text = await describeDraft(p, name, version);
		const shots = await screenshotsOnBranch(p, repo, name, version);
		const pull = await openPull(
			repo,
			draft.branch,
			text?.title ?? `feat(blocks): ${name}`,
			pullBody({
				repo,
				base: await defaultBranch(repo),
				branch: draft.branch,
				name,
				version,
				description: text?.body,
				shots: shots.list,
			}),
			reviewers,
		);
		return c.json({ pull, ...(shots.error ? { warning: shots.error } : {}) });
	});

	// Who can review a pull request in this project's repository, and who you are.
	app.get("/api/projects/:id/collaborators", async (c) => {
		const repo = await repoOf(await project(c.req.param("id")));
		if (!repo) return c.json({ error: "No GitHub repository." }, 400);
		return c.json(await collaborators(repo));
	});

	// The pull request opened from an accepted draft's branch, for the review to link.
	app.get("/api/projects/:id/drafts/:name/pull", async (c) => {
		const p = await project(c.req.param("id"));
		const name = v.blockName(c.req.param("name"));
		const repo = await repoOf(p);
		return c.json({
			pull: repo ? await pullForBranch(repo, `draft/${name}`).catch(() => null) : null,
		});
	});

	/** A quick `eds draft <verb> <name>` on one draft; its event or the job's error. */
	const draftStep = async (p: Project, name: string, verb: "reopen" | "update", event: string) => {
		const job = await startJob({
			projectId: p.id,
			cwd: p.path,
			kind: verb,
			block: name,
			args: ["draft", verb, name],
			locks: blockLock(p.id, name),
		});
		const done = await waitForJob(job.id);
		return done.events.find((e) => e.type === event) ?? { error: jobError(done) };
	};

	// Back into review, with its versions and branch (eds draft reopen).
	app.post("/api/projects/:id/drafts/:name/reopen", async (c) => {
		const p = await project(c.req.param("id"));
		const r = await draftStep(p, v.blockName(c.req.param("name")), "reopen", "reopened");
		return c.json(r, "error" in r ? 500 : 200);
	});

	// The default branch's newer commits merged into the draft's branch (eds draft update).
	app.post("/api/projects/:id/drafts/:name/update", async (c) => {
		const p = await project(c.req.param("id"));
		const r = await draftStep(p, v.blockName(c.req.param("name")), "update", "updated");
		return c.json(r, "error" in r ? 409 : 200);
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
	app.get("/api/usage", async (c) => c.json(summarize(await readUsage())));
	app.get("/api/projects/:id/history", async (c) =>
		c.json(await projectHistory((await project(c.req.param("id"))).path)),
	);
	// The pull requests for the History window; `pulls` is null without GitHub access.
	app.get("/api/projects/:id/pulls", async (c) => {
		const repo = await repoOf(await project(c.req.param("id")));
		try {
			return c.json({ repo, pulls: repo ? await listPulls(repo) : null });
		} catch (err) {
			return c.json({ repo, pulls: null, error: (err as Error).message });
		}
	});
	// Developer or contributor in the project's GitHub repository; null for a local folder or without GitHub.
	app.get("/api/projects/:id/role", async (c) => {
		const repo = await repoOf(await project(c.req.param("id")));
		try {
			return c.json({ role: repo && (await isOn("github")) ? await repoRole(repo) : null });
		} catch {
			return c.json({ role: null });
		}
	});
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
function isExport(source: unknown): boolean {
	return !!source && typeof source === "object" && (source as { read?: unknown }).read === "export";
}

/**
 * Save a Figma export where eds can read it, next to its drafts (tmp/ is not
 * committed). eds reads the file from disk, so the design costs no Figma call.
 */
async function saveExport(projectPath: string, block: string, raw: unknown): Promise<string> {
	const { extension, bytes } = v.designExport(raw);
	const dir = path.join(projectPath, "tmp", "eds-cli", "exports");
	await mkdir(dir, { recursive: true });
	const file = path.join(dir, `${block}${extension}`);
	await writeFile(file, bytes);
	return file;
}

/** The Figma token from Settings for a job that may read Figma, if there is one. */
async function figmaEnv(): Promise<Record<string, string>> {
	const token = await figmaToken();
	return token ? { FIGMA_TOKEN: token } : {};
}

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
