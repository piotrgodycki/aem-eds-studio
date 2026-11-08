import { execFile, spawn } from "node:child_process";

/** The sign-in each agent offers with the user's account (no API key). Nothing else can be run. */
export const AGENT_LOGIN: Record<string, { command: string; next?: string }> = {
	claude: { command: "claude", next: "Type /login and follow the steps in the browser." },
	codex: { command: "codex login" },
};

/** Opens a terminal window running the agent's sign-in. */
export function openAgentLogin(agent: string): boolean {
	const login = AGENT_LOGIN[agent];
	if (!login) return false;
	if (process.platform === "darwin") {
		execFile("osascript", [
			"-e",
			'tell application "Terminal" to activate',
			"-e",
			`tell application "Terminal" to do script "${login.command}"`,
		]);
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
