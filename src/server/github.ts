import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The GitHub token stays on this machine: it comes from GITHUB_TOKEN / GH_TOKEN
 * or the GitHub CLI's login, is used for API calls and git, and is never sent
 * to the browser.
 */
export async function githubToken(): Promise<string | null> {
	const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	if (env) return env;
	try {
		const { stdout } = await run("gh", ["auth", "token"], { timeout: 10_000 });
		return stdout.trim() || null;
	} catch {
		return null;
	}
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

export async function githubStatus(): Promise<{ connected: boolean; login?: string }> {
	const token = await githubToken();
	if (!token) return { connected: false };
	try {
		const me = await api<{ login: string }>(token, "/user");
		return { connected: true, login: me.login };
	} catch {
		return { connected: false };
	}
}

export async function listRepos(): Promise<Repo[]> {
	const token = await githubToken();
	if (!token) throw new Error("Not connected to GitHub: set GITHUB_TOKEN or run gh auth login.");
	const raw = await api<
		Array<{
			full_name: string;
			private: boolean;
			default_branch: string;
			pushed_at: string;
			description: string | null;
		}>
	>(
		token,
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
