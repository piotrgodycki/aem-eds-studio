import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

/**
 * An app opened from the Dock or Start menu doesn't get the environment of the
 * user's shell: not its PATH (so `claude`, `git`, `gh` or Homebrew tools
 * wouldn't be found), nor the agents' own settings from `.zshrc` (such as
 * CLAUDE_CONFIG_DIR, without which Claude Code looks signed out).
 */
function readLoginShell(): string {
	if (process.platform === "win32") return "";
	const shell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
	try {
		return execFileSync(shell, ["-ilc", 'printf "__ENV__\\n"; env; printf "__ENV__\\n"'], {
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return ""; // no login shell to ask
	}
}

/** `NAME=value` lines between the markers (anything a shell prints around them is ignored). */
export function parseEnv(out: string): Record<string, string> {
	const body = out.split("__ENV__\n")[1] ?? "";
	const env: Record<string, string> = {};
	for (const line of body.split("\n")) {
		const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (m) env[m[1]] = m[2];
	}
	return env;
}

/** The agents' own settings worth carrying over: config dirs, sign-in, endpoints. */
export const AGENT_ENV = /^(CLAUDE_|ANTHROPIC_|CODEX_|OPENAI_|CURSOR_|OLLAMA_)/;

export function agentEnv(shell: Record<string, string>): Record<string, string> {
	return Object.fromEntries(Object.entries(shell).filter(([k]) => AGENT_ENV.test(k)));
}

/** PATH: the login shell's, then the usual install places, then what we had; no duplicates. */
export function fullPath(current = process.env.PATH ?? "", shellPath = ""): string {
	const sep = path.delimiter;
	const parts: string[] = shellPath ? shellPath.split(sep) : [];
	if (process.platform !== "win32") {
		const home = os.homedir();
		parts.push(
			"/opt/homebrew/bin",
			"/usr/local/bin",
			path.join(home, ".local", "bin"),
			path.join(home, ".npm-global", "bin"),
			path.join(home, ".claude", "local"),
		);
	}
	parts.push(...current.split(sep));
	return [...new Set(parts.filter(Boolean))].join(sep);
}

/** Apply the login shell's PATH and agent settings to this process (and so to every child). */
export function adoptShellEnv(): void {
	const shell = parseEnv(readLoginShell());
	process.env.PATH = fullPath(process.env.PATH, shell.PATH);
	for (const [k, v] of Object.entries(agentEnv(shell))) if (!(k in process.env)) process.env[k] = v;
}
