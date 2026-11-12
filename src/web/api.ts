/** Typed calls to the studio server. Everything goes through `eds … --json` on the server. */

export interface Status {
	eds: { ok: boolean; version?: string; error?: string; min: string };
	/** A Figma token is set, so Figma designs can be read through REST. */
	figma?: { token: boolean };
	github: {
		connected: boolean;
		login?: string;
		source?: "app" | "env" | "gh";
		canSignIn: boolean;
	};
}

/** One thing the studio needs, and how to fix it (see src/server/setup.ts). */
export interface SetupCheck {
	id: "engine" | "git" | "agent" | "github" | "figma";
	need: "required" | "recommended" | "optional";
	ok: boolean;
	title: string;
	detail: string;
	fix?:
		| { kind: "signin"; agent: string }
		| { kind: "github" }
		| { kind: "command"; command: string }
		| { kind: "link"; url: string; label: string };
}

/** An agent as `eds agents` reports it. */
export interface AgentStatus {
	type: string;
	name: string;
	installed: boolean;
	ready: boolean;
	path?: string;
	model?: string;
	figmaMcp: boolean;
	install: string;
	signIn: string;
}

export interface Settings {
	tutorialDone?: boolean;
	sidebarCollapsed?: boolean;
}

/** A GitHub sign-in in progress: the code to enter on github.com. */
export interface DeviceFlow {
	state: "pending" | "done" | "expired" | "denied" | "error";
	userCode: string;
	verificationUri: string;
	expiresAt: number;
	error?: string;
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

export type BoardColumn = "prepared" | "progress" | "review" | "qa" | "done";
export interface BoardCard {
	kind: "issue" | "pr";
	number: number;
	title: string;
	url: string;
	column: BoardColumn;
	author: string;
	next: string[];
	labels: Array<{ name: string; color: string }>;
	updatedAt: string;
	ci?: "success" | "failure" | "pending" | null;
	changesRequested?: boolean;
	qaPassed?: boolean;
	preview?: string;
	screenshot?: string | null;
	closes?: number[];
}
export interface BoardData {
	repo: string;
	cards: BoardCard[];
	fetchedAt: string;
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
	projectId?: string;
	project?: string;
	block?: string;
	waitingFor?: string;
	kind: string;
	args: string[];
	status: "queued" | "running" | "done" | "failed" | "stopped";
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
	const data = (await res.json().catch(() => ({}))) as { error?: string; connect?: boolean };
	if (!res.ok)
		throw Object.assign(new Error(data.error ?? `${res.status} ${res.statusText}`), {
			connect: data.connect,
		});
	return data as T;
}

/** An agent's sign-in with its provider (the studio runs the agent's own login). */
export interface AgentAuth {
	agent: string;
	status: "idle" | "waiting" | "done" | "error";
	url?: string;
	askCode?: boolean;
	error?: string;
}

/** How a design is read (see `eds block from-design --help`). */
export interface SourceChoice {
	read?: "rest" | "mcp" | "export";
	screenshot?: boolean;
	signedIn?: boolean;
	refresh?: boolean;
}

export interface ModelChoice {
	agent?: Agent;
	model?: string;
}

const p = (id: string) => `/api/projects/${encodeURIComponent(id)}`;
const d = (id: string, name: string) => `${p(id)}/drafts/${encodeURIComponent(name)}`;

export const api = {
	status: () => call<Status>("GET", "/api/status"),
	settings: () => call<Settings>("GET", "/api/settings"),
	updateSettings: (patch: Settings) => call<Settings>("PATCH", "/api/settings", patch),
	agents: () => call<AgentStatus[]>("GET", "/api/agents"),
	setup: () => call<SetupCheck[]>("GET", "/api/setup"),
	agentAuth: (agent: string) => call<AgentAuth>("GET", `/api/agents/${agent}/login`),
	agentAuthStart: (agent: string) => call<AgentAuth>("POST", `/api/agents/${agent}/login`, {}),
	agentAuthCode: (agent: string, code: string) =>
		call<AgentAuth>("POST", `/api/agents/${agent}/login/code`, { code }),
	agentAuthCancel: (agent: string) => call<AgentAuth>("DELETE", `/api/agents/${agent}/login`, {}),
	projects: () => call<Project[]>("GET", "/api/projects"),
	project: (id: string) => call<Project>("GET", p(id)),
	addLocal: (path: string) => call<Project>("POST", "/api/projects", { path }),
	addGithub: (repo: string) => call<Project>("POST", "/api/projects", { repo }),
	setModel: (id: string, model: ModelChoice) => call<Project>("PATCH", p(id), { model }),
	removeProject: (id: string) => call<{ removed: boolean }>("DELETE", p(id)),
	repos: () => call<Repo[]>("GET", "/api/github/repos"),
	connectGithub: () => call<DeviceFlow>("POST", "/api/github/connect", {}),
	connectState: () => call<DeviceFlow | null>("GET", "/api/github/connect"),
	disconnectGithub: () => call<Status["github"]>("POST", "/api/github/disconnect", {}),
	drafts: (id: string) => call<Draft[]>("GET", `${p(id)}/drafts`),
	newDraft: (
		id: string,
		b: {
			design: string;
			name: string;
			source?: SourceChoice;
			/** A frame exported from Figma, base64, when `source.read` is "export". */
			export?: { name: string; data: string };
		} & ModelChoice,
	) => call<Job>("POST", `${p(id)}/drafts`, b),
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
	allJobs: () => call<Job[]>("GET", "/api/jobs"),
	exportSettings: (id: string) => call<Record<string, unknown>>("GET", `${p(id)}/export`),
	importSettings: (settings: unknown) =>
		call<{ project: Project; created: boolean }>("POST", "/api/projects/import", { settings }),
	board: (id: string) => call<BoardData>("GET", `${p(id)}/board`),
	jobs: (id: string) => call<Job[]>("GET", `${p(id)}/jobs`),
	stopJob: (jobId: string) => call<{ stopped: boolean }>("POST", `/api/jobs/${jobId}/stop`, {}),
};

/** What the desktop app says about updates (src/desktop/updates.ts). */
export interface UpdateState {
	state: "idle" | "checking" | "none" | "available" | "downloading" | "ready" | "error";
	version?: string;
	percent?: number;
	inPlace: boolean;
	error?: string;
}

interface DesktopBridge {
	pickFolder: () => Promise<string | null>;
	update?: {
		state: () => Promise<UpdateState | null>;
		check: () => Promise<void>;
		install: () => Promise<void>;
		onChange: (fn: (state: UpdateState) => void) => () => void;
	};
}

/** The desktop app's bridge (src/desktop/preload.cts); undefined in a plain browser. */
export const desktop = (window as { studioDesktop?: DesktopBridge }).studioDesktop;
