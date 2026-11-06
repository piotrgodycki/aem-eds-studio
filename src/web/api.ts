/** Typed calls to the studio server. Everything goes through `eds … --json` on the server. */

export interface Status {
	eds: { ok: boolean; version?: string; error?: string; min: string };
	github: { connected: boolean; login?: string };
}

export type Agent = "claude" | "cursor" | "codex" | "ollama" | "omlx" | "local";

export interface Project {
	id: string;
	name: string;
	path: string;
	source: { type: "local" } | { type: "github"; repo: string };
	model?: { agent?: Agent; model?: string };
}

export interface Repo {
	fullName: string;
	private: boolean;
	defaultBranch: string;
	pushedAt: string;
	description: string | null;
}

export interface DraftVersion {
	version: number;
	createdAt: string;
	feedback?: string;
	ok: boolean;
	files: string[];
}

export interface Draft {
	name: string;
	status: "open" | "accepted" | "discarded";
	source: { provider: string; designRef?: string; agent?: string; model?: string };
	versions: DraftVersion[];
	accepted?: { version: number; at: string; commit?: string };
}

export interface EdsEvent {
	v: number;
	type: string;
	[key: string]: unknown;
}

export interface Job {
	id: string;
	kind: string;
	args: string[];
	status: "running" | "done" | "failed" | "stopped";
	startedAt: string;
	endedAt?: string;
	events: EdsEvent[];
	stderr: string[];
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
	const res = await fetch(url, {
		method,
		headers: body === undefined ? {} : { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const data = (await res.json().catch(() => ({}))) as { error?: string };
	if (!res.ok) throw new Error(data.error ?? `${res.status} ${res.statusText}`);
	return data as T;
}

export interface ModelChoice {
	agent?: Agent;
	model?: string;
}

const p = (id: string) => `/api/projects/${encodeURIComponent(id)}`;
const d = (id: string, name: string) => `${p(id)}/drafts/${encodeURIComponent(name)}`;

export const api = {
	status: () => call<Status>("GET", "/api/status"),
	projects: () => call<Project[]>("GET", "/api/projects"),
	project: (id: string) => call<Project>("GET", p(id)),
	addLocal: (path: string) => call<Project>("POST", "/api/projects", { path }),
	addGithub: (repo: string) => call<Project>("POST", "/api/projects", { repo }),
	setModel: (id: string, model: ModelChoice) => call<Project>("PATCH", p(id), { model }),
	removeProject: (id: string) => call<{ removed: boolean }>("DELETE", p(id)),
	repos: () => call<Repo[]>("GET", "/api/github/repos"),
	drafts: (id: string) => call<Draft[]>("GET", `${p(id)}/drafts`),
	newDraft: (id: string, b: { design: string; name: string } & ModelChoice) =>
		call<Job>("POST", `${p(id)}/drafts`, b),
	refine: (id: string, name: string, b: { feedback: string; version?: number } & ModelChoice) =>
		call<Job>("POST", `${d(id, name)}/refine`, b),
	preview: (id: string, name: string, version?: number) =>
		call<{ jobId: string; url: string; version?: number }>("POST", `${d(id, name)}/preview`, {
			version,
		}),
	accept: (id: string, name: string, b: { version?: number; branch?: string; commit?: boolean }) =>
		call<{ version: number; commit?: string; branch?: string; ok: boolean; error?: string }>(
			"POST",
			`${d(id, name)}/accept`,
			b,
		),
	discard: (id: string, name: string) =>
		call<{ discarded: string }>("POST", `${d(id, name)}/discard`, {}),
	jobs: (id: string) => call<Job[]>("GET", `${p(id)}/jobs`),
	stopJob: (jobId: string) => call<{ stopped: boolean }>("POST", `/api/jobs/${jobId}/stop`, {}),
};
