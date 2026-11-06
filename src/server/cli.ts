#!/usr/bin/env node
import { execFile } from "node:child_process";
import { resolveEds } from "./eds.js";
import { startStudio } from "./start.js";

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const port = Number.parseInt(flag("--port") ?? process.env.PORT ?? "4600", 10);
const open = !args.includes("--no-open");

if (args.includes("--help") || args.includes("-h")) {
	console.log(`aem-eds-studio [--port 4600] [--no-open]

Opens the studio in your browser. Listens on 127.0.0.1 only.
Needs the eds CLI (aem-eds-kit) and, for GitHub projects, GITHUB_TOKEN or gh auth login.`);
	process.exit(0);
}

const studio = await startStudio({ port });
console.log(`aem-eds-studio → ${studio.url}`);
resolveEds().then(
	(e) => console.log(`  eds ${e.version}`),
	(err: Error) => console.log(`  ⚠ ${err.message}`),
);
if (open) {
	const cmd =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
	execFile(cmd, [studio.url], () => {});
}

const shutdown = async () => {
	await studio.close();
	process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
