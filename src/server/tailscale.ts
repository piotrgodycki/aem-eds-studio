import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

/**
 * HTTPS for paired devices through Tailscale (STUDIO-145): `tailscale serve`
 * gives this computer an https://<machine>.<tailnet>.ts.net address with a
 * real certificate and forwards it to the network listener. The studio only
 * runs Tailscale's own CLI; it never handles the certificate.
 */

const run = promisify(execFile);

/** Where the CLI lives: on PATH (Linux, Homebrew), or inside the macOS and Windows apps. */
const CANDIDATES = [
	"tailscale",
	"/Applications/Tailscale.app/Contents/MacOS/Tailscale",
	"C:\\Program Files\\Tailscale\\tailscale.exe",
];

async function tailscale(args: string[]): Promise<string> {
	let last: unknown;
	for (const bin of CANDIDATES) {
		if (bin.includes("/") || bin.includes("\\")) {
			if (!existsSync(bin)) continue;
		}
		try {
			return (await run(bin, args, { timeout: 15_000 })).stdout;
		} catch (e) {
			last = e;
			if ((e as NodeJS.ErrnoException).code !== "ENOENT") break;
		}
	}
	throw last ?? new Error("Tailscale isn't installed.");
}

export interface TailscaleState {
	/** Tailscale runs and this computer is signed in to a tailnet. */
	running: boolean;
	/** The machine's HTTPS name, e.g. studio-mac.tail1234.ts.net, when the tailnet allows HTTPS. */
	httpsName?: string;
	/** `tailscale serve` forwards that name to the studio's network listener. */
	serving: boolean;
}

/** Tailscale's view of this computer; all false when it isn't installed or running. */
export async function tailscaleState(port: number): Promise<TailscaleState> {
	let status: { BackendState?: string; CertDomains?: string[] | null };
	try {
		status = JSON.parse(await tailscale(["status", "--json"]));
	} catch {
		return { running: false, serving: false };
	}
	const running = status.BackendState === "Running";
	const httpsName = status.CertDomains?.[0];
	if (!running || !httpsName) return { running, httpsName, serving: false };
	let serving = false;
	try {
		const serve = JSON.parse((await tailscale(["serve", "status", "--json"])) || "{}") as {
			Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>;
		};
		const proxy = serve.Web?.[`${httpsName}:443`]?.Handlers?.["/"]?.Proxy ?? "";
		serving = new RegExp(`^http://(127\\.0\\.0\\.1|localhost):${port}/?$`).test(proxy);
	} catch {}
	return { running, httpsName, serving };
}

/** Forward https://<name>/ to the network listener, or stop forwarding it. */
export async function setTailscaleServe(on: boolean, port: number): Promise<void> {
	await tailscale(
		on
			? ["serve", "--bg", "--https=443", `http://127.0.0.1:${port}`]
			: ["serve", "--https=443", "off"],
	);
}
