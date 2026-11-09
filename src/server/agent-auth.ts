import { type ChildProcess, spawn } from "node:child_process";

/**
 * Signing an agent in with the provider's own login, inside the studio: no
 * terminal. The agent's CLI opens the provider's sign-in page in the browser
 * and stores the login itself; the studio only starts it, shows the link and,
 * when the CLI asks for one, passes the code from the page back to it.
 */
export const AGENT_AUTH: Record<string, { name: string; command: string; args: string[] }> = {
	claude: { name: "Claude Code", command: "claude", args: ["auth", "login"] },
	codex: { name: "Codex", command: "codex", args: ["login"] },
};

export interface AuthState {
	agent: string;
	status: "idle" | "waiting" | "done" | "error";
	/** The provider's sign-in page, once the CLI printed it. */
	url?: string;
	/** The CLI waits for the code shown on that page. */
	askCode?: boolean;
	error?: string;
}

const TIMEOUT_MS = 10 * 60_000;
const runs = new Map<
	string,
	{ state: AuthState; child?: ChildProcess; output: string; errors: string }
>();

/** The first sign-in link the CLI printed (the provider's own page, https only). */
export function signInUrl(output: string): string | undefined {
	return output.match(/https:\/\/[^\s"'<>]+/)?.[0];
}

/** The CLI asks for the code from the sign-in page. */
export function asksForCode(output: string): boolean {
	return /paste (the )?(code|token)|enter (the )?(code|authorization code)/i.test(output);
}

function lastLine(output: string): string {
	const lines = output
		.split(/\r?\n/)
		// biome-ignore lint/suspicious/noControlCharactersInRegex: strip terminal colours
		.map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim())
		.filter(Boolean);
	return lines.at(-1) ?? "";
}

export function authState(agent: string): AuthState {
	return runs.get(agent)?.state ?? { agent, status: "idle" };
}

/** Starts the agent's sign-in (or returns the one already waiting). */
export function startAuth(
	agent: string,
	commands: typeof AGENT_AUTH = AGENT_AUTH,
	env: NodeJS.ProcessEnv = process.env,
): AuthState {
	const login = commands[agent];
	if (!login) throw new Error(`Unknown agent: ${agent}`);
	const current = runs.get(agent);
	if (current?.state.status === "waiting") return current.state;

	const run = {
		state: { agent, status: "waiting" } as AuthState,
		output: "",
		errors: "",
		child: undefined as ChildProcess | undefined,
	};
	runs.set(agent, run);
	const child = spawn(login.command, login.args, {
		env,
		stdio: ["pipe", "pipe", "pipe"],
		windowsHide: true,
		shell: process.platform === "win32", // claude.cmd / codex.cmd
	});
	run.child = child;
	const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
	timer.unref();
	const read = (chunk: Buffer) => {
		run.output = (run.output + chunk.toString()).slice(-20_000);
		run.state.url ??= signInUrl(run.output);
		// Only a new prompt asks again (not the one already answered).
		if (asksForCode(chunk.toString())) run.state.askCode = true;
	};
	child.stdout?.on("data", read);
	child.stderr?.on("data", (chunk: Buffer) => {
		run.errors = (run.errors + chunk.toString()).slice(-5_000);
		read(chunk);
	});
	child.on("error", (err: NodeJS.ErrnoException) => {
		clearTimeout(timer);
		run.state = {
			agent,
			status: "error",
			error:
				err.code === "ENOENT"
					? `${login.name} isn't installed (no ${login.command} on PATH).`
					: err.message,
		};
	});
	child.on("close", (code) => {
		clearTimeout(timer);
		if (run.state.status !== "waiting") return;
		run.state =
			code === 0
				? { agent, status: "done" }
				: {
						agent,
						status: "error",
						// The CLI's own error (stderr), not the prompt it was showing.
						error:
							lastLine(run.errors) ||
							lastLine(run.output) ||
							`Sign-in ended (exit ${code ?? "killed"}).`,
					};
	});
	return run.state;
}

/** Passes the code from the provider's page to the waiting CLI. */
export function sendAuthCode(agent: string, code: string): AuthState {
	const run = runs.get(agent);
	if (!run || run.state.status !== "waiting" || !run.child?.stdin)
		throw new Error("No sign-in is waiting for a code.");
	run.child.stdin.write(`${code.trim()}\n`);
	run.state.askCode = false;
	return run.state;
}

export function cancelAuth(agent: string): AuthState {
	const run = runs.get(agent);
	if (run?.state.status === "waiting") run.child?.kill();
	runs.delete(agent);
	return authState(agent);
}
