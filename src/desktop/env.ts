import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

/**
 * An app opened from the Dock or Start menu doesn't get the PATH of the
 * user's shell, so `claude`, `git`, `gh` or Homebrew tools wouldn't be found.
 * Read the login shell's PATH (macOS / Linux) and add the usual install
 * places, keeping whatever was already there.
 */
export function fullPath(current = process.env.PATH ?? ""): string {
	const sep = path.delimiter;
	const parts: string[] = [];
	if (process.platform !== "win32") {
		const shell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
		try {
			const out = execFileSync(shell, ["-ilc", 'printf "__PATH__%s__PATH__" "$PATH"'], {
				encoding: "utf-8",
				timeout: 5000,
				stdio: ["ignore", "pipe", "ignore"],
			});
			const m = out.match(/__PATH__(.*)__PATH__/);
			if (m?.[1]) parts.push(...m[1].split(sep));
		} catch {
			// no login shell to ask; fall back to the usual places below
		}
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
