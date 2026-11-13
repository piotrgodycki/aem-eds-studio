import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import type { Thread } from "../src/server/chat.js";
import { resetEds } from "../src/server/eds.js";
import { setFigmaTokenStore } from "../src/server/figma-token.js";
import { parseLog, projectHistory } from "../src/server/history.js";
import { jobEnv, stopAll, waitForJob } from "../src/server/jobs.js";

const here = path.dirname(fileURLToPath(import.meta.url));
let tmp: string;
let site: string;
let log: string;
const app = createApp({ webDir: undefined });

const HOST = "127.0.0.1:4600";
async function req(
	method: string,
	url: string,
	body?: unknown,
	headers: Record<string, string> = {},
) {
	const res = await app.request(`http://${HOST}${url}`, {
		method,
		headers: {
			host: HOST,
			...(body === undefined ? {} : { "content-type": "application/json" }),
			...headers,
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await res.text();
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		json = text;
	}
	return { status: res.status, json: json as Record<string, unknown> & unknown[] };
}

/** A chat thread once nothing in it runs or waits: the answers are saved after their jobs end. */
async function settled(projectId: string, thread: string): Promise<Thread> {
	for (let i = 0; i < 100; i++) {
		const t = (await req("GET", `/api/projects/${projectId}/chats/${thread}`))
			.json as unknown as Thread;
		if (t.messages.length && !t.messages.some((m) => m.jobId || m.queued)) return t;
		await new Promise((done) => setTimeout(done, 50));
	}
	throw new Error("The chat thread never settled.");
}

/** The `eds` argument lists the fake CLI was called with, minus --version probes. */
async function edsCalls(): Promise<string[][]> {
	const raw = await readFile(log, "utf-8").catch(() => "");
	return raw
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l) as string[])
		.filter((a) => a[0] !== "--version");
}

beforeAll(async () => {
	tmp = await mkdtemp(path.join(os.tmpdir(), "studio-"));
	site = path.join(tmp, "site");
	await mkdir(site);
	await writeFile(path.join(site, "fstab.yaml"), "mountpoints: {}\n");
	log = path.join(tmp, "eds.log");
	process.env.AEM_EDS_STUDIO_HOME = path.join(tmp, "home");
	process.env.EDS_BIN = path.join(here, "fixtures", "fake-eds.mjs");
	process.env.FAKE_EDS_LOG = log;
	process.env.GITHUB_TOKEN = "";
	process.env.GH_TOKEN = "";
	resetEds();
});
afterAll(async () => {
	stopAll();
	await rm(tmp, { recursive: true, force: true });
});
beforeEach(async () => {
	await rm(log, { force: true });
});

describe("local-only guard", () => {
	it("rejects another Host (DNS rebinding)", async () => {
		const r = await req("GET", "/api/projects", undefined, { host: "evil.example:4600" });
		expect(r.status).toBe(403);
	});
	it("rejects a write from another origin, and a write that isn't JSON", async () => {
		const cross = await req(
			"POST",
			"/api/projects",
			{ path: site },
			{ origin: "https://evil.example" },
		);
		expect(cross.status).toBe(403);
		const res = await app.request(`http://${HOST}/api/projects`, {
			method: "POST",
			headers: { host: HOST, "content-type": "text/plain" },
			body: "path=/",
		});
		expect(res.status).toBe(415);
	});
});

describe("studio API", () => {
	let id = "";

	it("reports the eds CLI it found", async () => {
		const r = await req("GET", "/api/status");
		expect(r.json).toMatchObject({
			eds: { ok: true, version: "0.4.84" },
			github: { connected: false },
		});
	});

	it("offers Connect GitHub only when the build has a Client ID and a keychain", async () => {
		expect((await req("GET", "/api/status")).json.github).toEqual({
			connected: false,
			canSignIn: false,
			canSaveToken: false,
		});
		const r = await req("POST", "/api/github/connect", {});
		expect(r.status).toBe(400);
		expect(String(r.json.error)).toMatch(/isn't set up/);
		expect((await req("GET", "/api/github/connect")).json).toBeNull();
	});

	it("takes a pasted GitHub token only in the desktop app, and only a well-formed one", async () => {
		expect((await req("PUT", "/api/github/token", { token: "nope" })).status).toBe(400);
		// Well formed, but there's no keychain here: refused before anything is stored.
		const r = await req("PUT", "/api/github/token", { token: `ghp_${"a".repeat(36)}` });
		expect(r.status).toBe(400);
		expect(String(r.json.error)).toMatch(/desktop app/);
	});

	it("remembers app settings and lists the agents through eds --json agents", async () => {
		expect((await req("GET", "/api/settings")).json).toEqual({});
		expect((await req("PATCH", "/api/settings", { tutorialDone: true, other: 1 })).json).toEqual({
			tutorialDone: true,
		});
		expect((await req("GET", "/api/settings")).json).toEqual({ tutorialDone: true });
		const r = await req("GET", "/api/agents");
		expect(r.json).toEqual([
			expect.objectContaining({ type: "claude", ready: true }),
			expect.objectContaining({ type: "codex", installed: false }),
		]);
		expect(await edsCalls()).toEqual([["--json", "--no-color", "agents"]]);
	});

	it("lists what the studio needs in the Setup window", async () => {
		const r = await req("GET", "/api/setup");
		expect(r.json).toMatchObject([
			{ id: "engine", ok: true },
			{ id: "git" },
			{ id: "agent", ok: true },
			{ id: "github", ok: false },
			{ id: "figma" },
		]);
	});

	it("refuses an eds that is too old", async () => {
		process.env.FAKE_EDS_VERSION = "0.4.48";
		resetEds();
		const r = await req("GET", "/api/status");
		expect(r.json.eds).toMatchObject({
			ok: false,
			error: expect.stringMatching(/0\.4\.48 is too old/),
		});
		process.env.FAKE_EDS_VERSION = "";
		resetEds();
	});

	it("adds a local Edge Delivery folder, and nothing else", async () => {
		expect((await req("POST", "/api/projects", { path: "relative/dir" })).status).toBe(400);
		expect((await req("POST", "/api/projects", { path: tmp })).json.error).toMatch(
			/doesn't look like/,
		);
		const r = await req("POST", "/api/projects", { path: site });
		expect(r.status).toBe(201);
		id = String(r.json.id);
		// Adding it again returns the same project.
		expect((await req("POST", "/api/projects", { path: site })).json.id).toBe(id);
		expect(((await req("GET", "/api/projects")).json as unknown[]).length).toBe(1);
	});

	it("lists drafts through eds --json draft list", async () => {
		const r = await req("GET", `/api/projects/${id}/drafts`);
		expect(r.json).toEqual([expect.objectContaining({ name: "hero", status: "open" })]);
		expect(await edsCalls()).toEqual([["--json", "--no-color", "draft", "list"]]);
	});

	it("starts a draft job with the project's default model and streams its events", async () => {
		await req("PATCH", `/api/projects/${id}`, { model: { agent: "claude", model: "sonnet" } });
		const r = await req("POST", `/api/projects/${id}/drafts`, {
			design: "https://www.figma.com/design/abc/File?node-id=1-2",
			name: "promo",
		});
		expect(r.status).toBe(202);
		const job = await waitForJob(String(r.json.id));
		expect(job.status).toBe("done");
		expect(job.events.map((e) => e.type)).toEqual([
			"start",
			"agent",
			"agent-result",
			"draft",
			"result",
		]);
		expect((await edsCalls())[0]).toEqual([
			"--json",
			"--no-color",
			"block",
			"from-design",
			"https://www.figma.com/design/abc/File?node-id=1-2",
			"--name",
			"promo",
			"--draft",
			"--agent",
			"claude",
			"--model",
			"sonnet",
		]);

		const sse = await app.request(`http://${HOST}/api/jobs/${job.id}/events`, {
			headers: { host: HOST },
		});
		const text = await sse.text();
		expect(text).toContain("event: eds");
		expect(text).toContain('"costUsd":0.021');
		expect(text).toContain("event: end");

		// The run's usage is kept for the Usage window.
		const usage = (await req("GET", "/api/usage")).json;
		expect(usage.limits).toEqual([
			expect.objectContaining({
				agent: "claude",
				limits: [expect.objectContaining({ window: "five_hour", usedPercent: 42 })],
			}),
		]);
		expect(usage.periods).toContainEqual(
			expect.objectContaining({ period: "today", agent: "claude" }),
		);
	});

	it("saves a Figma export in the project and hands eds the file", async () => {
		const r = await req("POST", `/api/projects/${id}/drafts`, {
			design: "https://www.figma.com/design/abc/File?node-id=1-2",
			name: "banner",
			source: { read: "export", screenshot: true },
			export: { name: "Banner.svg", data: Buffer.from("<svg/>").toString("base64") },
		});
		expect(r.status).toBe(202);
		await waitForJob(String(r.json.id));
		const file = path.join(site, "tmp", "eds-cli", "exports", "banner.svg");
		expect(await readFile(file, "utf-8")).toBe("<svg/>");
		const call = (await edsCalls()).find((c) => c.includes("banner"));
		expect(call?.slice(2, 5)).toEqual(["block", "from-design", file]);
		expect(call).not.toContain("--screenshot");
	});

	it("marks a job failed when eds reports an error", async () => {
		const r = await req("POST", `/api/projects/${id}/drafts`, { design: "sample", name: "broken" });
		const job = await waitForJob(String(r.json.id));
		expect(job.status).toBe("failed");
		expect((await edsCalls())[0]).toContain("--sample");
	});

	it("validates what ends up on the eds command line", async () => {
		const bad = [
			{ design: "javascript:alert(1)", name: "hero" },
			{ design: "--agent=evil", name: "hero" },
			{ design: "https://example.com/", name: "--draft" },
			{ design: "https://example.com/", name: "Hero Banner" },
			{ design: "https://example.com/", name: "hero", agent: "rm" },
			{ design: "https://example.com/", name: "hero", model: "--yes" },
		];
		for (const b of bad)
			expect((await req("POST", `/api/projects/${id}/drafts`, b)).status).toBe(400);
		expect(await edsCalls()).toEqual([]);
	});

	it("passes a review comment after --, so it can never be read as a flag", async () => {
		const r = await req("POST", `/api/projects/${id}/drafts/hero/refine`, {
			feedback: "--bigger headline",
			version: 1,
		});
		const job = await waitForJob(String(r.json.id));
		expect(job.status).toBe("done");
		const call = (await edsCalls())[0];
		expect(call.slice(2, 5)).toEqual(["draft", "refine", "--from"]);
		expect(call.slice(-3)).toEqual(["--", "hero", "--bigger headline"]);
	});

	it("starts a preview for a version and returns its URL", async () => {
		const r = await req("POST", `/api/projects/${id}/drafts/hero/preview`, { version: 1 });
		expect(r.json).toMatchObject({
			url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/$/),
			version: 1,
		});
		expect(await (await fetch(String(r.json.url))).text()).toBe("preview of hero v1");
		expect((await edsCalls())[0].slice(2, 6)).toEqual(["draft", "preview", "hero", "1"]);
	});

	it("accepts onto a branch and discards", async () => {
		const a = await req("POST", `/api/projects/${id}/drafts/hero/accept`, {
			branch: "feature/hero",
		});
		expect(a.json).toMatchObject({ commit: "abc1234", branch: "feature/hero", ok: true });
		expect(
			(await req("POST", `/api/projects/${id}/drafts/hero/accept`, { branch: "-x" })).status,
		).toBe(400);
		const d = await req("POST", `/api/projects/${id}/drafts/hero/discard`, {});
		expect(d.json).toEqual({ discarded: "hero" });
	});

	it("in a GitHub project, pushes each draft version and accepts on its branch", async () => {
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) => execFileSync("git", ["-C", site, ...args]);
		git("init", "-q");
		git("remote", "add", "origin", "https://github.com/acme/site.git");
		try {
			await writeFile(log, "");
			const made = await req("POST", `/api/projects/${id}/drafts`, {
				design: "sample",
				name: "hero",
			});
			await waitForJob((made.json as unknown as { id: string }).id);
			const refined = await req("POST", `/api/projects/${id}/drafts/hero/refine`, {
				feedback: "Bigger",
			});
			await waitForJob((refined.json as unknown as { id: string }).id);
			const accept = await req("POST", `/api/projects/${id}/drafts/hero/accept`, {
				branch: "feature/ignored",
			});
			const calls = await edsCalls();
			expect(calls.find((c) => c.includes("from-design"))).toContain("--push");
			expect(calls.find((c) => c.includes("refine"))).toContain("--push");
			const accepting = calls.find((c) => c.includes("accept")) ?? [];
			expect(accepting).toContain("--on-branch");
			expect(accepting).not.toContain("--branch");
			expect(accept.json).toMatchObject({ ok: true, branch: "draft/hero" });
			// Opening the pull request is the next step, for a draft eds lists as accepted.
			const pull = await req("POST", `/api/projects/${id}/drafts/hero/pull`, {});
			expect(pull.status).toBe(400);
			expect(pull.json.error).toMatch(/Accept the draft "hero" first/);
		} finally {
			await rm(path.join(site, ".git"), { recursive: true, force: true });
		}
	});

	it("exports settings without secrets and imports them back", async () => {
		await req("PATCH", `/api/projects/${id}`, { model: { agent: "claude", model: "haiku" } });
		const ex = await req("GET", `/api/projects/${id}/export`);
		expect(ex.json).toMatchObject({
			format: "aem-eds-studio/project",
			version: 1,
			repo: null,
			path: site,
			model: { agent: "claude", model: "haiku" },
		});
		expect(JSON.stringify(ex.json)).not.toMatch(/token/i);

		// Same folder: the project is updated, not duplicated.
		const again = await req("POST", "/api/projects/import", {
			settings: { ...ex.json, model: { agent: "codex" } },
		});
		expect(again.status).toBe(200);
		expect(again.json).toMatchObject({
			created: false,
			project: { id, model: { agent: "codex" } },
		});
		expect(((await req("GET", "/api/projects")).json as unknown[]).length).toBe(1);

		const bad = await req("POST", "/api/projects/import", { settings: { format: "other" } });
		expect(bad.status).toBe(400);
		const elsewhere = await req("POST", "/api/projects/import", {
			settings: { ...ex.json, path: "/nowhere/on/this/machine" },
		});
		expect(elsewhere.json.error).toMatch(/local folder on another machine/);
		const evil = await req("POST", "/api/projects/import", {
			settings: { ...ex.json, model: { agent: "rm -rf" } },
		});
		expect(evil.status).toBe(400);
	});

	it("needs a GitHub origin and a token for the work board", async () => {
		const r = await req("GET", `/api/projects/${id}/board`);
		expect(r.status).toBe(404); // a local folder with no github.com origin
		expect(String(r.json.error)).toMatch(/no GitHub repository/);
	});

	it("chats: each message is one eds ask turn with the conversation so far", async () => {
		const askLog = path.join(tmp, "ask.log");
		process.env.FAKE_EDS_ASK_LOG = askLog;
		const first = await req("POST", `/api/projects/${id}/chats`, {
			text: "What blocks are there?",
		});
		expect(first.status).toBe(202);
		const thread = String((first.json.thread as { id: string }).id);
		await settled(id, thread);

		const second = await req("POST", `/api/projects/${id}/chats`, {
			thread,
			text: "Now build cards from the design",
		});
		expect(second.status).toBe(202);
		const t = await settled(id, thread);
		expect(t.title).toBe("What blocks are there?");
		expect(t.messages.map((m: { role: string; text: string }) => [m.role, m.text])).toEqual([
			["user", "What blocks are there?"],
			["agent", "You said: What blocks are there?"],
			["user", "Now build cards from the design"],
			["agent", "You said: Now build cards from the design"],
		]);
		expect(t.messages[3].action).toMatchObject({ type: "block", name: "cards" });

		const sent = (await readFile(askLog, "utf-8"))
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(sent[1].history).toEqual([
			{ role: "user", text: "What blocks are there?" },
			{ role: "agent", text: "You said: What blocks are there?" },
		]);
		const calls = await edsCalls();
		expect(calls.at(-1)?.slice(2, 4)).toEqual(["ask", "--input"]);

		expect((await req("GET", `/api/projects/${id}/chats`)).json).toMatchObject([
			{ id: thread, messages: 4 },
		]);
		await req("DELETE", `/api/projects/${id}/chats/${thread}`, {});
		expect((await req("GET", `/api/projects/${id}/chats`)).json).toEqual([]);
		delete process.env.FAKE_EDS_ASK_LOG;
	});

	it("chats: the agent can change in the middle of a thread", async () => {
		const first = await req("POST", `/api/projects/${id}/chats`, { text: "one", agent: "claude" });
		const thread = String((first.json.thread as { id: string }).id);
		await settled(id, thread);
		expect((await edsCalls()).at(-1)).toEqual(expect.arrayContaining(["--agent", "claude"]));

		await req("POST", `/api/projects/${id}/chats`, { thread, text: "two", agent: "codex" });
		await settled(id, thread);
		expect((await edsCalls()).at(-1)).toEqual(expect.arrayContaining(["--agent", "codex"]));

		// No agent: the project's default answers.
		await req("POST", `/api/projects/${id}/chats`, { thread, text: "three" });
		const t = await settled(id, thread);
		expect((await edsCalls()).at(-1)).not.toContain("--agent");
		expect(t.agent).toBeUndefined();
	});
	it("chats: a message can quote another thread and bring that thread along", async () => {
		const askLog = path.join(tmp, "ask-refs.log");
		process.env.FAKE_EDS_ASK_LOG = askLog;
		const a = await req("POST", `/api/projects/${id}/chats`, { text: "Plan the hero" });
		const threadA = (a.json.thread as { id: string }).id;
		await settled(id, threadA);

		const b = await req("POST", `/api/projects/${id}/chats`, {
			text: "Do what we agreed",
			quotes: [{ thread: threadA, text: "Plan the hero" }],
			threads: [threadA],
		});
		await waitForJob((b.json.job as { id: string }).id);
		const sent = (await readFile(askLog, "utf-8"))
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		const attached = sent[1].attachments as Array<{ title: string; text: string }>;
		expect(attached[0]).toEqual({
			title: `Quote from “Plan the hero” (${threadA})`,
			text: "Plan the hero",
		});
		expect(attached[1].title).toBe(`Thread “Plan the hero” (${threadA})`);
		expect(attached[1].text).toContain("Agent: You said: Plan the hero");

		expect(
			(
				await req("POST", `/api/projects/${id}/chats`, {
					text: "x",
					quotes: [{ thread: "nope", text: "y" }],
				})
			).status,
		).toBe(400);
		delete process.env.FAKE_EDS_ASK_LOG;
	});

	it("chats: messages sent while the agent works wait, then go to it together", async () => {
		process.env.FAKE_EDS_ASK_DELAY = "300";
		const first = await req("POST", `/api/projects/${id}/chats`, { text: "one" });
		const thread = (first.json.thread as { id: string }).id;
		const two = await req("POST", `/api/projects/${id}/chats`, { thread, text: "two" });
		await req("POST", `/api/projects/${id}/chats`, { thread, text: "three" });
		expect(two.status).toBe(202);
		expect(two.json.job).toBeNull(); // the agent is busy with "one"

		const read = async () =>
			(await req("GET", `/api/projects/${id}/chats/${thread}`)).json as unknown as Thread;
		let t = await read();
		expect(t.messages.filter((m) => m.queued).map((m) => m.text)).toEqual(["two", "three"]);
		// The side menu shows the thread as working until every message is answered.
		const list = async () =>
			(
				(await req("GET", `/api/projects/${id}/chats`)).json as Array<{
					id: string;
					working: boolean;
					answeredAt?: string;
				}>
			).find((x) => x.id === thread);
		expect((await list())?.working).toBe(true);
		for (
			let i = 0;
			i < 50 && (t.messages.some((m) => m.jobId || m.queued) || t.messages.length < 5);
			i++
		) {
			await new Promise((done) => setTimeout(done, 100));
			t = await read();
		}
		expect(t.messages.map((m) => [m.role, m.text])).toEqual([
			["user", "one"],
			["agent", "You said: one"],
			["user", "two"],
			["user", "three"],
			["agent", "You said: two\n\nthree"],
		]);
		expect(await list()).toMatchObject({ working: false, answeredAt: t.messages[4].at });
		delete process.env.FAKE_EDS_ASK_DELAY;
	});

	it("chats: @ points at a draft, a block and earlier agent work", async () => {
		await mkdir(path.join(site, "blocks", "hero"), { recursive: true });
		expect((await req("GET", `/api/projects/${id}/blocks`)).json).toContain("hero");

		const askLog = path.join(tmp, "ask-mentions.log");
		process.env.FAKE_EDS_ASK_LOG = askLog;
		const first = await req("POST", `/api/projects/${id}/chats`, { text: "Look at the hero" });
		const job = (first.json.job as { id: string }).id;
		await waitForJob(job);
		const r = await req("POST", `/api/projects/${id}/chats`, {
			text: "Why did that go wrong?",
			drafts: ["cards"],
			blocks: ["hero"],
			jobs: [job],
		});
		await waitForJob((r.json.job as { id: string }).id);
		const sent = (await readFile(askLog, "utf-8"))
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		const attached = sent[1].attachments as Array<{ title: string; text: string }>;
		expect(attached.map((a) => a.title)).toEqual([
			"Draft cards",
			"Block hero",
			"Agent work: chat (done)",
		]);
		expect(attached[0].text).toContain("tmp/eds-cli/drafts/cards/draft.json");
		expect(attached[1].text).toContain("blocks/hero/");
		expect(attached[2].text).toContain("eds ask");

		expect(
			(await req("POST", `/api/projects/${id}/chats`, { text: "x", blocks: ["../etc"] })).status,
		).toBe(400);
		expect(
			(await req("POST", `/api/projects/${id}/chats`, { text: "x", jobs: ["not-a-job"] })).status,
		).toBe(400);
	});

	it("chats: a yes in words runs the change that waited for it", async () => {
		const askLog = path.join(tmp, "ask-yes.log");
		process.env.FAKE_EDS_ASK_LOG = askLog;
		const first = await req("POST", `/api/projects/${id}/chats`, {
			text: "Please change the hero",
		});
		const thread = (first.json.thread as { id: string }).id;
		await settled(id, thread);
		await writeFile(log, "");
		const yes = await req("POST", `/api/projects/${id}/chats`, { thread, text: "tak" });
		await settled(id, thread);

		const sent = (await readFile(askLog, "utf-8"))
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(sent[0].pending).toBeUndefined();
		expect(sent[1].pending).toEqual({ type: "refine", name: "hero", feedback: "Bigger headline" });
		const t = (await req("GET", `/api/projects/${id}/chats/${thread}`)).json as unknown as Thread;
		const answer = t.messages.at(-1);
		expect(answer?.confirmed?.action).toMatchObject({ type: "refine", name: "hero" });
		expect(answer?.confirmed?.jobId).toEqual(expect.any(String));
		expect((await edsCalls()).find((c) => c.includes("refine"))?.slice(-2)).toEqual([
			"hero",
			"Bigger headline",
		]);
		expect(yes.status).toBe(202);
	});

	it("chats: pasted images and files go into the project, where the agent can read them", async () => {
		const askLog = path.join(tmp, "ask-files.log");
		process.env.FAKE_EDS_ASK_LOG = askLog;
		const png = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
		const r = await req("POST", `/api/projects/${id}/chats`, {
			text: "What is in these?",
			files: [
				{ name: "shot.png", data: png },
				{ name: "notes.md", data: Buffer.from("# Notes\nTwo buttons").toString("base64") },
			],
		});
		const thread = (r.json.thread as { id: string }).id;
		await waitForJob((r.json.job as { id: string }).id);
		const sent = JSON.parse((await readFile(askLog, "utf-8")).trim());
		expect(sent.attachments[0].title).toBe("Image shot.png");
		expect(sent.attachments[0].text).toMatch(/tmp\/eds-cli\/chat\/.+-shot\.png\. Read that file/);
		expect(sent.attachments[1]).toEqual({ title: "File notes.md", text: "# Notes\nTwo buttons" });

		const t = (await req("GET", `/api/projects/${id}/chats/${thread}`)).json as unknown as Thread;
		const image = String(t.messages[0].images?.[0]);
		expect(existsSync(path.join(site, image))).toBe(true);
		const file = image.split("/").pop();
		const res = await app.request(
			`http://${HOST}/api/projects/${id}/chats/${thread}/files/${file}`,
			{
				headers: { host: HOST },
			},
		);
		expect(res.headers.get("content-type")).toBe("image/png");

		expect(
			(
				await req("POST", `/api/projects/${id}/chats`, {
					text: "x",
					files: [{ name: "run.exe", data: png }],
				})
			).status,
		).toBe(400);
		await req("DELETE", `/api/projects/${id}/chats/${thread}`, {});
		expect(existsSync(path.join(site, image))).toBe(false);
		delete process.env.FAKE_EDS_ASK_LOG;
	});

	it("chats: keeps the agent's error when a turn fails, and checks what comes in", async () => {
		const r = await req("POST", `/api/projects/${id}/chats`, { text: "this will fail" });
		const t = await settled(id, (r.json.thread as { id: string }).id);
		expect(t.messages[1].error).toMatch(/Not logged in/);

		expect((await req("POST", `/api/projects/${id}/chats`, { text: "  " })).status).toBe(400);
		expect(
			(await req("POST", `/api/projects/${id}/chats`, { text: "hi", pulls: ["1"] })).status,
		).toBe(400);
		expect(
			(await req("POST", `/api/projects/${id}/chats`, { text: "hi", thread: "../x" })).status,
		).toBe(400);
	});

	it("lists no pull requests for a project without a GitHub repository", async () => {
		expect((await req("GET", `/api/projects/${id}/pulls`)).json).toEqual({
			repo: null,
			pulls: null,
		});
	});

	it("forgets a project without touching its folder", async () => {
		expect((await req("DELETE", `/api/projects/${id}`, {})).json).toEqual({ removed: true });
		expect((await req("GET", `/api/projects/${id}/drafts`)).status).toBe(400);
		await expect(readFile(path.join(site, "fstab.yaml"), "utf-8")).resolves.toContain(
			"mountpoints",
		);
	});
});

describe("job environment", () => {
	it("always asks eds for agents that stay inside the project", () => {
		process.env.EDS_CONFINED_ONLY = "0";
		expect(jobEnv({}).EDS_CONFINED_ONLY).toBe("1");
		delete process.env.EDS_CONFINED_ONLY;
	});
});

describe("settings: switches", () => {
	afterEach(async () => {
		await req("PATCH", "/api/settings", { github: true });
	});

	it("turns GitHub off: shown as off, and the work board gets no token", async () => {
		await req("PATCH", "/api/settings", { github: false });
		const status = (await req("GET", "/api/status")).json.github;
		expect(status).toMatchObject({ connected: false, off: true });
		const setup = (await req("GET", "/api/setup")).json as Array<{
			id: string;
			ok: boolean;
			detail: string;
		}>;
		expect(setup.find((c) => c.id === "github")).toMatchObject({
			ok: true,
			detail: expect.stringMatching(/Turned off/),
		});
	});
});

describe("settings: Figma token", () => {
	it("is write-only, and needs the desktop app's keychain to save", async () => {
		expect((await req("GET", "/api/settings/figma")).json).toEqual({
			saved: false,
			env: false,
			canSave: false,
		});
		const r = await req("PUT", "/api/settings/figma", { token: `figd_${"a".repeat(30)}` });
		expect(r.status).toBe(400);
		expect(String(r.json.error)).toMatch(/desktop app/);
		expect((await req("PUT", "/api/settings/figma", { token: "nope" })).status).toBe(400);
	});

	it("saves to the token store, hands it to jobs, and removes it", async () => {
		let kept: string | null = null;
		setFigmaTokenStore({
			read: async () => kept,
			write: async (t) => {
				kept = t;
			},
			clear: async () => {
				kept = null;
			},
		});
		const token = `figd_${"b".repeat(30)}`;
		const saved = await req("PUT", "/api/settings/figma", { token });
		expect(saved.json).toEqual({ saved: true, env: false, canSave: true });
		expect(JSON.stringify(saved.json)).not.toContain(token);
		expect((await req("GET", "/api/status")).json.figma).toEqual({ token: true });
		await req("DELETE", "/api/settings/figma", {});
		expect(kept).toBeNull();
		setFigmaTokenStore(null);
	});
});

describe("project history", () => {
	it("parses git log and marks blocks accepted in the studio", () => {
		const sep = "\x1f";
		expect(
			parseLog(
				`a1b2c3d${sep}Ana${sep}2026-11-12T10:00:00+01:00${sep}feat(blocks): hero from figma\n` +
					`d4e5f6a${sep}Ben${sep}2026-11-11T09:00:00+01:00${sep}Fix footer links\n`,
			),
		).toEqual([
			{
				hash: "a1b2c3d",
				author: "Ana",
				date: "2026-11-12T10:00:00+01:00",
				subject: "feat(blocks): hero from figma",
				accepted: true,
			},
			{
				hash: "d4e5f6a",
				author: "Ben",
				date: "2026-11-11T09:00:00+01:00",
				subject: "Fix footer links",
				accepted: false,
			},
		]);
	});

	it("is empty for a folder that isn't a git repository", async () => {
		expect(await projectHistory(os.tmpdir())).toEqual([]);
	});
});

describe("roles", () => {
	it("calls Write access and above a developer, the rest a contributor", async () => {
		const { roleFrom } = await import("../src/server/github.js");
		expect(roleFrom({ admin: true })).toBe("developer");
		expect(roleFrom({ maintain: true })).toBe("developer");
		expect(roleFrom({ push: true })).toBe("developer");
		expect(roleFrom({ push: false })).toBe("contributor");
		expect(roleFrom(undefined)).toBe("contributor");
	});
});
