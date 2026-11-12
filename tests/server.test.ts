import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
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
	process.env.PATH = `${path.join(here, "fixtures", "bin")}${path.delimiter}${process.env.PATH}`;
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
			eds: { ok: true, version: "0.4.79" },
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
			{ id: "github", ok: false, fix: { kind: "command", command: "gh auth login" } },
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
