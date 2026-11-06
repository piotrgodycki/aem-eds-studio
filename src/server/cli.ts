#!/usr/bin/env node
import { execFile } from "node:child_process";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { resolveEds } from "./eds.js";
import { stopAll } from "./jobs.js";

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

const app = createApp();
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, (info) => {
	const url = `http://127.0.0.1:${info.port}/`;
	console.log(`aem-eds-studio → ${url}`);
	resolveEds().then(
		(e) => console.log(`  eds ${e.version}`),
		(err: Error) => console.log(`  ⚠ ${err.message}`),
	);
	if (open) {
		const cmd =
			process.platform === "darwin"
				? "open"
				: process.platform === "win32"
					? "explorer"
					: "xdg-open";
		execFile(cmd, [url], () => {});
	}
});

const shutdown = () => {
	stopAll();
	server.close();
	process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
