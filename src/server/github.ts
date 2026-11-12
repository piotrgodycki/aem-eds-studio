import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { canSaveToken, canSignIn, installUrl, saveToken, storedToken } from "./github-auth.js";
import { isOn } from "./settings.js";
import { InputError } from "./validate.js";

const run = promisify(execFile);

/**
 * The GitHub token stays on this machine and is never sent to the browser.
 * The desktop app uses only what the user gave it (Connect GitHub, or a token
 * pasted in Settings), never a token another tool left in the shell. The
 * browser mode has no keychain, so there the developer sets GITHUB_TOKEN.
 */
export type TokenSource = "signin" | "pasted" | "env";

async function findToken(): Promise<{ token: string; source: TokenSource } | null> {
	if (!(await isOn("github"))) return null; // turned off in Settings: nothing goes to GitHub
	const given = await storedToken();
	if (given) return { token: given.token, source: given.signedIn ? "signin" : "pasted" };
	if (canSaveToken()) return null; // the desktop app: nothing given yet
	const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	return env ? { token: env, source: "env" } : null;
}

export async function githubToken(): Promise<string | null> {
	return (await findToken())?.token ?? null;
}

async function api<T>(token: string, url: string): Promise<T> {
	const res = await fetch(`https://api.github.com${url}`, {
		headers: {
			authorization: `Bearer ${token}`,
			accept: "application/vnd.github+json",
			"user-agent": "aem-eds-studio",
		},
	});
	if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
	return (await res.json()) as T;
}

export interface Repo {
	fullName: string;
	private: boolean;
	defaultBranch: string;
	pushedAt: string;
	description: string | null;
}

export interface GithubStatus {
	connected: boolean;
	login?: string;
	/** Where the token came from: Connect GitHub, a token pasted in Settings, or GITHUB_TOKEN. */
	source?: TokenSource;
	/** With Connect GitHub: where to pick the repositories the studio may reach. */
	installUrl?: string;
	/** Whether "Connect GitHub" is available in this build. */
	canSignIn: boolean;
	/** Whether a token can be pasted in Settings (the desktop app has a keychain). */
	canSaveToken: boolean;
	/** Turned off in Settings. */
	off?: boolean;
}

export async function githubStatus(): Promise<GithubStatus> {
	const can = { canSignIn: canSignIn(), canSaveToken: canSaveToken() };
	if (!(await isOn("github"))) return { connected: false, off: true, ...can };
	const found = await findToken();
	if (!found) return { connected: false, ...can };
	try {
		const me = await api<{ login: string }>(found.token, "/user");
		return {
			connected: true,
			login: me.login,
			source: found.source,
			...(found.source === "signin" ? { installUrl } : {}),
			...can,
		};
	} catch {
		return { connected: false, ...can };
	}
}

/** Keep a pasted token once GitHub accepts it, so a typo never replaces a working one. */
export async function saveGithubToken(token: string): Promise<GithubStatus> {
	if (!canSaveToken())
		throw new InputError("Saving a token needs the desktop app; here, use gh or GITHUB_TOKEN.");
	try {
		await api(token, "/user");
	} catch {
		throw new InputError("GitHub didn't accept that token. Check it and its access.");
	}
	await saveToken(token);
	return githubStatus();
}

interface RawRepo {
	full_name: string;
	private: boolean;
	default_branch: string;
	pushed_at: string;
	description: string | null;
}

/** With Connect GitHub, only the repositories the user installed the app on. */
async function installedRepos(token: string): Promise<RawRepo[]> {
	const { installations } = await api<{ installations: Array<{ id: number }> }>(
		token,
		"/user/installations?per_page=100",
	);
	const lists = await Promise.all(
		installations.map((i) =>
			api<{ repositories: RawRepo[] }>(
				token,
				`/user/installations/${i.id}/repositories?per_page=100`,
			),
		),
	);
	return lists
		.flatMap((l) => l.repositories)
		.sort((a, b) => b.pushed_at.localeCompare(a.pushed_at));
}

export async function listRepos(): Promise<Repo[]> {
	const found = await findToken();
	if (!found) throw new Error("Not connected to GitHub: connect it in Settings.");
	const raw =
		found.source === "signin"
			? await installedRepos(found.token)
			: await api<RawRepo[]>(
					found.token,
					"/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member",
				);
	return raw.map((r) => ({
		fullName: r.full_name,
		private: r.private,
		defaultBranch: r.default_branch,
		pushedAt: r.pushed_at,
		description: r.description,
	}));
}

/**
 * Environment that lets git authenticate to github.com with the token without
 * putting it on a command line (where other processes could read it) or in
 * the clone's config.
 */
export function gitAuthEnv(token: string): Record<string, string> {
	const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
	return {
		GIT_CONFIG_COUNT: "1",
		GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
		GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
		GIT_TERMINAL_PROMPT: "0",
	};
}

export async function cloneRepo(fullName: string, dest: string): Promise<void> {
	const token = await githubToken();
	await run("git", ["clone", "--quiet", "--", `https://github.com/${fullName}.git`, dest], {
		env: { ...process.env, ...(token ? gitAuthEnv(token) : { GIT_TERMINAL_PROMPT: "0" }) },
		timeout: 5 * 60_000,
	});
}

/** owner/name from a local clone's origin, if it is on github.com. */
export async function repoFromGit(dir: string): Promise<string | null> {
	try {
		const { stdout } = await run("git", ["-C", dir, "remote", "get-url", "origin"], {
			timeout: 5000,
		});
		const m = stdout.trim().match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
		return m ? `${m[1]}/${m[2]}` : null;
	} catch {
		return null;
	}
}
