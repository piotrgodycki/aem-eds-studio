import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

/** The first aem-eds-kit release with drafts, `--json` events, `draft … <version>` and Electron-as-Node argv. */
export const MIN_EDS_VERSION = "0.4.90";

export interface EdsCommand {
	/** The executable to spawn and the arguments that come before the command's own. */
	file: string;
	prefix: string[];
	/** Extra environment the CLI needs (inside the desktop app: run Electron as Node). */
	env: Record<string, string>;
	version: string;
}

/** One line of the CLI's `--json` stream (see aem-eds-kit's README, "For tools: --json"). */
export interface EdsEvent {
	v: number;
	type: string;
	[key: string]: unknown;
}

const run = promisify(execFile);

export function compareVersions(a: string, b: string): number {
	const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
	const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
	for (let i = 0; i < 3; i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d) return Math.sign(d);
	}
	return 0;
}

type Candidate = Omit<EdsCommand, "version">;

/**
 * Run a script with this process's own runtime. In the desktop app that is
 * Electron, which acts as Node only with ELECTRON_RUN_AS_NODE, set for that
 * child alone (Electron's own helper processes must not get it).
 */
const viaRuntime = (script: string): Candidate => ({
	file: process.execPath,
	prefix: [script],
	env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {},
});

function candidates(): Candidate[] {
	const list: Candidate[] = [];
	const env = process.env.EDS_BIN;
	if (env) {
		list.push(/\.(c|m)?js$/.test(env) ? viaRuntime(env) : { file: env, prefix: [], env: {} });
		return list;
	}
	// The aem-eds-kit this package depends on (wherever the package manager put it), then
	// whatever `eds` is on PATH.
	try {
		const pkg = createRequire(import.meta.url).resolve("aem-eds-kit/package.json");
		const bin = path.join(path.dirname(pkg), "dist", "bin", "eds.js");
		if (existsSync(bin)) list.push(viaRuntime(bin));
	} catch {
		// not installed alongside the studio
	}
	list.push({ file: "eds", prefix: [], env: {} });
	return list;
}

let cached: Promise<EdsCommand> | undefined;

/** Find the `eds` CLI and check it is new enough. Throws with a message for the UI. */
export function resolveEds(): Promise<EdsCommand> {
	cached ??= (async () => {
		let lastError = "";
		for (const c of candidates()) {
			try {
				const { stdout } = await run(c.file, [...c.prefix, "--version"], {
					timeout: 15_000,
					env: { ...process.env, ...c.env },
				});
				const version = stdout.trim().split(/\s+/).pop() ?? "";
				if (!/^\d+\.\d+\.\d+/.test(version)) {
					lastError = `${[c.file, ...c.prefix].join(" ")} --version printed "${version}", not a version.`;
					continue;
				}
				if (compareVersions(version, MIN_EDS_VERSION) < 0) {
					lastError = `aem-eds-kit ${version} is too old: the studio needs ${MIN_EDS_VERSION} or newer (npm i -g aem-eds-kit@latest).`;
					continue;
				}
				return { ...c, version };
			} catch {
				lastError ||= "The eds CLI wasn't found. Install it with: npm i -g aem-eds-kit";
			}
		}
		throw new Error(lastError);
	})();
	cached.catch(() => {
		cached = undefined; // try again next time (the user may install it meanwhile)
	});
	return cached;
}

/** Forget the resolved CLI (tests, or after the user changed EDS_BIN). */
export function resetEds(): void {
	cached = undefined;
}
