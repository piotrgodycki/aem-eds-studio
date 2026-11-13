import { useEffect, useState } from "react";
/** Typed calls to the studio server. Everything goes through `eds … --json` on the server. */

export interface Status {
	eds: { ok: boolean; version?: string; error?: string; min: string };
	/** A Figma token is set, so Figma designs can be read through REST. */
	figma?: { token: boolean };
	github: {
		connected: boolean;
		login?: string;
		source?: "signin" | "pasted" | "env";
		installUrl?: string;
		/** Turned off in Settings. */
		off?: boolean;
		canSignIn: boolean;
		canSaveToken: boolean;
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
	/** Stays inside the project folder (`eds agents`); Cursor and Codex can read any file. */
	confined: boolean;
	install: string;
	signIn: string;
}

/** The Figma token in Settings: whether one is saved or set; never the token itself. */
export interface FigmaTokenStatus {
	saved: boolean;
	env: boolean;
	canSave: boolean;
}

/** A commit in the project's history (Settings → History). */
export interface Commit {
	hash: string;
	author: string;
	date: string;
	subject: string;
	accepted: boolean;
}

/** One message in a project's chat (src/server/chat.ts). */
export interface ChatMessage {
	role: "user" | "agent";
	text: string;
	at: string;
	attachments?: string[];
	/** Set while the agent is still answering. */
	jobId?: string;
	/** Images attached to the message, as paths in the project. */
	images?: string[];
	/** Sent while the agent was busy; answered with the others in its next turn. */
	queued?: boolean;
	action?: { type: "block" | "refine"; name: string; design?: string; feedback?: string };
	error?: string;
}

export interface ChatThread {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	agent?: string;
	model?: string;
	messages: ChatMessage[];
}

/** A pull request in the History window. */
export interface PullRequest {
	number: number;
	title: string;
	status: "open" | "draft" | "merged" | "closed";
	url: string;
	author: string;
	updatedAt: string;
}

export interface TokenUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

/** One window of an agent's plan (Claude Code: five_hour, seven_day, …). */
export interface PlanLimit {
	window: string;
	usedPercent: number;
	resetsAt?: string;
	status?: string;
}

export interface UsageTotals {
	runs: number;
	tokens: TokenUsage;
	costUsd: number;
}

/** What the agents the studio ran used (see src/server/usage.ts). */
export interface UsageSummary {
	limits: Array<{ agent: string; at: string; limits: PlanLimit[] }>;
	periods: Array<{ period: "today" | "7d" | "30d"; agent: string; totals: UsageTotals }>;
	models: Array<{ model: string; totals: UsageTotals }>;
}

export interface Settings {
	tutorialDone?: boolean;
	sidebarCollapsed?: boolean;
	/** The switches in Settings: each is on unless turned off. */
	autoUpdates?: boolean;
	github?: boolean;
	/** Paired devices may reach the studio over the network; off unless turned on. */
	networkAccess?: boolean;
}

/** A phone or another computer paired to reach the studio over the network. */
export interface Device {
	id: string;
	name: string;
	pairedAt: string;
	lastSeenAt?: string;
}

/** Network access as the computer sees it (Settings). */
export interface NetworkAccess {
	on: boolean;
	port: number;
	addresses: string[];
	devices: Device[];
	tailscale: Tailscale;
}

/** Tailscale on the computer: HTTPS for paired devices through `tailscale serve`. */
export interface Tailscale {
	running: boolean;
	httpsName?: string;
	serving: boolean;
}

/** Sent when the server says this device isn't paired (or no longer is). */
export const UNPAIRED = "studio:unpaired";

/** A GitHub sign-in in progress: the code to enter on github.com. */
export interface DeviceFlow {
	state: "pending" | "done" | "expired" | "denied" | "error";
	userCode: string;
	verificationUri: string;
	expiresAt: number;
	error?: string;
}

export type Agent = "claude" | "cursor" | "codex" | "ollama" | "omlx" | "local";

/** Write access and above accept drafts (a developer); Triage and Read create and review. */
export type Role = "developer" | "contributor";

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
	// The server takes writes as JSON only (its local-only guard), so every write sends one.
	const json = method === "GET" ? undefined : (body ?? {});
	const res = await fetch(url, {
		method,
		headers: json === undefined ? {} : { "content-type": "application/json" },
		body: json === undefined ? undefined : JSON.stringify(json),
	});
	const data = (await res.json().catch(() => ({}))) as { error?: string; connect?: boolean };
	if (res.status === 401) window.dispatchEvent(new Event(UNPAIRED));
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
	figmaToken: () => call<FigmaTokenStatus>("GET", "/api/settings/figma"),
	saveFigmaToken: (token: string) =>
		call<FigmaTokenStatus>("PUT", "/api/settings/figma", { token }),
	removeFigmaToken: () => call<FigmaTokenStatus>("DELETE", "/api/settings/figma"),
	history: (id: string) => call<Commit[]>("GET", `${p(id)}/history`),
	/** Developer or contributor in the project's GitHub repository; null for a local folder. */
	role: (id: string) => call<{ role: Role | null }>("GET", `${p(id)}/role`),
	pulls: (id: string) =>
		call<{ repo: string | null; pulls: PullRequest[] | null; error?: string }>(
			"GET",
			`${p(id)}/pulls`,
		),
	usage: () => call<UsageSummary>("GET", "/api/usage"),
	agentAuth: (agent: string) => call<AgentAuth>("GET", `/api/agents/${agent}/login`),
	agentAuthStart: (agent: string) => call<AgentAuth>("POST", `/api/agents/${agent}/login`),
	agentAuthCode: (agent: string, code: string) =>
		call<AgentAuth>("POST", `/api/agents/${agent}/login/code`, { code }),
	agentAuthCancel: (agent: string) => call<AgentAuth>("DELETE", `/api/agents/${agent}/login`),
	projects: () => call<Project[]>("GET", "/api/projects"),
	project: (id: string) => call<Project>("GET", p(id)),
	addLocal: (path: string) => call<Project>("POST", "/api/projects", { path }),
	addGithub: (repo: string) => call<Project>("POST", "/api/projects", { repo }),
	setModel: (id: string, model: ModelChoice) => call<Project>("PATCH", p(id), { model }),
	removeProject: (id: string) => call<{ removed: boolean }>("DELETE", p(id)),
	repos: () => call<Repo[]>("GET", "/api/github/repos"),
	saveGithubToken: (token: string) => call<Status["github"]>("PUT", "/api/github/token", { token }),
	connectGithub: () => call<DeviceFlow>("POST", "/api/github/connect", {}),
	connectState: () => call<DeviceFlow | null>("GET", "/api/github/connect"),
	disconnectGithub: () => call<Status["github"]>("POST", "/api/github/disconnect", {}),
	device: () => call<{ device: Device | null }>("GET", "/api/device"),
	pair: (code: string, name: string) =>
		call<{ device: Device }>("POST", "/api/pair", { code, name }),
	network: () => call<NetworkAccess>("GET", "/api/network"),
	pairCode: () =>
		call<{ code: string; expiresAt: string; links: string[] }>("POST", "/api/network/pair-code"),
	setTailscale: (on: boolean) => call<Tailscale>("POST", "/api/network/tailscale", { on }),
	revokeDevice: (id: string) =>
		call<{ revoked: boolean }>("DELETE", `/api/network/devices/${encodeURIComponent(id)}`),
	chats: (id: string) =>
		call<
			Array<
				Omit<ChatThread, "messages"> & {
					messages: number;
					working: boolean;
					answeredAt?: string;
				}
			>
		>("GET", `${p(id)}/chats`),
	chat: (id: string, thread: string) => call<ChatThread>("GET", `${p(id)}/chats/${thread}`),
	sendChat: (
		id: string,
		b: {
			thread?: string;
			text: string;
			pulls?: number[];
			quotes?: Array<{ thread: string; text: string }>;
			threads?: string[];
			files?: Array<{ name: string; data: string }>;
		} & ModelChoice,
	) => call<{ thread: ChatThread; job: Job | null }>("POST", `${p(id)}/chats`, b),
	/** Where the page shows an image attached in a thread. */
	chatImage: (id: string, thread: string, file: string) =>
		`${p(id)}/chats/${encodeURIComponent(thread)}/files/${encodeURIComponent(file)}`,
	deleteChat: (id: string, thread: string) =>
		call<{ deleted: boolean }>("DELETE", `${p(id)}/chats/${thread}`),
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

/** The signed-in person's role in a project, asked once per page. */
export function useRole(projectId: string): Role | null {
	const [role, setRole] = useState<Role | null>(null);
	useEffect(() => {
		api.role(projectId).then(
			(r) => setRole(r.role),
			() => setRole(null),
		);
	}, [projectId]);
	return role;
}
