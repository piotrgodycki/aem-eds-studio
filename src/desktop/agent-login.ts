import { execFile, spawn } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** The sign-in each agent offers with the user's account (no API key). Nothing else can be run. */
export const AGENT_LOGIN: Record<string, { command: string; next?: string }> = {
	claude: { command: "claude", next: "Type /login and follow the steps in the browser." },
	codex: { command: "codex login" },
};

/**
 * The script Terminal runs for a sign-in on macOS: the user's login shell
 * (so `claude` / `codex` are on its PATH), the command, then the shell stays
 * open for whatever the agent prints.
 */
export function commandFile(command: string): string {
	return `#!/bin/sh
clear
exec "\${SHELL:-/bin/zsh}" -l -c '${command}; exec "\${SHELL:-/bin/zsh}" -l'
`;
}

/** Opens a terminal window running the agent's sign-in. */
export function openAgentLogin(agent: string): boolean {
	const login = AGENT_LOGIN[agent];
	if (!login) return false;
	if (process.platform === "darwin") {
		// Opening a .command file is like double-clicking it: Terminal runs it.
		// Driving Terminal with AppleScript would need the "control Terminal" permission.
		const dir = mkdtempSync(path.join(os.tmpdir(), "aem-eds-studio-"));
		const file = path.join(dir, `${agent}-sign-in.command`);
		writeFileSync(file, commandFile(login.command));
		chmodSync(file, 0o700);
		execFile("open", ["-a", "Terminal", file]);
		setTimeout(() => rmSync(dir, { recursive: true, force: true }), 60_000).unref();
	} else if (process.platform === "win32") {
		spawn("cmd.exe", ["/c", "start", "cmd", "/k", login.command], {
			detached: true,
			stdio: "ignore",
		}).unref();
	} else {
		spawn("x-terminal-emulator", ["-e", login.command], {
			detached: true,
			stdio: "ignore",
		}).unref();
	}
	return true;
}
