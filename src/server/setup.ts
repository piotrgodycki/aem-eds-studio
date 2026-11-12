import { execFile } from "node:child_process";
import { MIN_EDS_VERSION, resolveEds } from "./eds.js";
import { figmaToken } from "./figma-token.js";
import { githubStatus } from "./github.js";

/** How to fix a check, as the UI offers it. */
export type SetupFix =
	| { kind: "signin"; agent: string }
	| { kind: "github" }
	| { kind: "command"; command: string }
	| { kind: "link"; url: string; label: string };

export interface SetupCheck {
	id: "engine" | "git" | "agent" | "github" | "figma";
	need: "required" | "recommended" | "optional";
	ok: boolean;
	title: string;
	detail: string;
	fix?: SetupFix;
}

/** An agent as `eds agents` reports it (only what the check reads). */
export interface AgentInfo {
	type: string;
	name: string;
	installed: boolean;
	ready: boolean;
	confined: boolean;
	install: string;
}

const SIGN_IN_HERE = new Set(["claude", "codex"]);

async function engineCheck(): Promise<SetupCheck> {
	const base = { id: "engine", need: "required", title: "Engine (aem-eds-kit)" } as const;
	try {
		const eds = await resolveEds();
		return { ...base, ok: true, detail: `aem-eds-kit ${eds.version}` };
	} catch (err) {
		return {
			...base,
			ok: false,
			detail: (err as Error).message,
			fix: { kind: "command", command: `npm i -g aem-eds-kit@^${MIN_EDS_VERSION}` },
		};
	}
}

function gitCheck(): Promise<SetupCheck> {
	const base = { id: "git", need: "required", title: "Git" } as const;
	return new Promise((resolve) => {
		execFile("git", ["--version"], (err, stdout) =>
			resolve(
				err
					? {
							...base,
							ok: false,
							detail: "Needed to clone projects and accept blocks onto a branch.",
							fix: { kind: "link", url: "https://git-scm.com/downloads", label: "Get Git" },
						}
					: { ...base, ok: true, detail: stdout.trim().replace(/^git version /, "Git ") },
			),
		);
	});
}

export function agentCheck(agents: AgentInfo[] | null): SetupCheck {
	const base = { id: "agent", need: "required", title: "AI agent" } as const;
	if (!agents)
		return { ...base, ok: false, detail: "Couldn't list the agents (the engine is missing)." };
	// The studio runs only agents that stay inside the project (EDS_CONFINED_ONLY).
	const ready = agents.find((a) => a.ready && a.confined) ?? agents.find((a) => a.ready);
	if (ready?.confined) return { ...base, ok: true, detail: `${ready.name} is signed in.` };
	if (ready)
		return {
			...base,
			ok: false,
			detail: `${ready.name} can't be kept inside the project here, so the studio won't run it. Use Claude Code or a local model (Ollama, oMLX).`,
			fix:
				ready.type === "claude"
					? { kind: "command", command: ready.install } // an older Claude Code: update it
					: undefined,
		};
	const signedOut = agents.find((a) => a.installed && SIGN_IN_HERE.has(a.type));
	if (signedOut)
		return {
			...base,
			ok: false,
			detail: `${signedOut.name} is installed but not signed in.`,
			fix: { kind: "signin", agent: signedOut.type },
		};
	const claude = agents.find((a) => a.type === "claude");
	return {
		...base,
		ok: false,
		detail: "No agent is installed. Claude Code works with your Claude account.",
		fix: claude ? { kind: "command", command: claude.install } : undefined,
	};
}

async function githubCheck(): Promise<SetupCheck> {
	return githubCheckFor(await githubStatus());
}

/** Connect in the studio; the browser mode, which has no keychain, takes GITHUB_TOKEN. */
export function githubCheckFor(gh: {
	connected: boolean;
	login?: string;
	canSignIn: boolean;
	canSaveToken?: boolean;
}): SetupCheck {
	const base = { id: "github", need: "recommended", title: "GitHub" } as const;
	if (gh.connected) return { ...base, ok: true, detail: `Connected as ${gh.login}.` };
	const why = "For the work board, projects from GitHub and accepting onto a branch.";
	if (gh.canSignIn) return { ...base, ok: false, detail: why, fix: { kind: "github" } };
	return {
		...base,
		ok: false,
		detail: gh.canSaveToken
			? `${why} Paste a token in Settings.`
			: `${why} In the browser, start the studio with GITHUB_TOKEN set.`,
	};
}

async function figmaCheck(): Promise<SetupCheck> {
	const ok = !!(await figmaToken());
	return {
		id: "figma",
		need: "optional",
		title: "Figma token",
		ok,
		detail: ok
			? "Figma designs are read through REST."
			: "Without it, Figma is read through MCP or from an export. Add one in Settings.",
		fix: ok
			? undefined
			: {
					kind: "link",
					url: "https://help.figma.com/hc/en-us/articles/8085703771159",
					label: "How to create one",
				},
	};
}

/** Everything the studio needs, in the order the Setup window lists it. */
export async function setupChecks(
	listAgents: () => Promise<AgentInfo[] | null>,
): Promise<SetupCheck[]> {
	const [engine, git, agents, github, figma] = await Promise.all([
		engineCheck(),
		gitCheck(),
		listAgents().catch(() => null),
		githubCheck(),
		figmaCheck(),
	]);
	return [engine, git, agentCheck(agents), github, figma];
}
