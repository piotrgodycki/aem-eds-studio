#!/usr/bin/env node
// A stand-in for the eds CLI: answers like `eds --json …` would, without an agent.
// Every call's arguments are appended to $FAKE_EDS_LOG (one JSON array per line).
import { appendFileSync } from "node:fs";
import http from "node:http";

const args = process.argv.slice(2);
if (process.env.FAKE_EDS_LOG) appendFileSync(process.env.FAKE_EDS_LOG, `${JSON.stringify(args)}\n`);
if (args[0] === "--version") {
	console.log(process.env.FAKE_EDS_VERSION || "0.4.62");
	process.exit(0);
}

const out = (e) => process.stdout.write(`${JSON.stringify({ v: 1, ...e })}\n`);
const rest = args.filter((a) => a !== "--json" && a !== "--no-color");
const [cmd, sub] = rest;
out({ type: "start", command: `${cmd} ${sub}`, cli: "0.4.62" });
process.stderr.write("human output goes to stderr\n");

const drafts = [
	{
		name: "hero",
		status: "open",
		source: { provider: "web", designRef: "https://example.com/" },
		versions: [
			{
				version: 1,
				createdAt: "2026-11-06T10:00:00.000Z",
				ok: true,
				files: ["hero.css", "hero.js"],
			},
		],
	},
];
const end = (ok = true) => {
	out({ type: "result", ok, exitCode: ok ? 0 : 1 });
	process.exit(ok ? 0 : 1);
};

if (cmd === "agents") {
	out({
		type: "agents",
		agents: [
			{
				type: "claude",
				name: "Claude Code",
				installed: true,
				ready: true,
				figmaMcp: false,
				path: "/usr/bin/claude",
				install: "npm install -g @anthropic-ai/claude-code",
				signIn: "Run `claude` once and sign in.",
			},
			{
				type: "codex",
				name: "Codex",
				installed: false,
				ready: false,
				figmaMcp: false,
				install: "npm install -g @openai/codex",
				signIn: "Run `codex login`.",
			},
		],
	});
	end();
} else if (cmd === "draft" && sub === "list") {
	out({ type: "drafts", drafts });
	end();
} else if (cmd === "block" && sub === "from-design") {
	const name = rest[rest.indexOf("--name") + 1];
	if (name === "signedout") {
		out({ type: "log", level: "info", message: "Running Claude Code - live log:" });
		out({ type: "log", level: "error", message: "Not logged in · Please run /login" });
		out({ type: "log", level: "error", message: 'No draft was produced for "signedout" — see the log above.' });
		end(false);
	}
	if (name === "broken") {
		out({ type: "log", level: "error", message: "The agent didn't write any files." });
		end(false);
	}
	// FAKE_EDS_DELAY: take this long, so tests can watch jobs overlap or queue.
	setTimeout(
		() => {
			out({ type: "agent", tool: "Write", label: `✎ blocks/${name}/${name}.css`, durationMs: 12 });
			out({ type: "agent-result", durationMs: 1500, costUsd: 0.021 });
			out({
				type: "draft",
				name,
				version: 1,
				ok: true,
				dir: `tmp/eds-cli/drafts/${name}/v1`,
				files: [`${name}.css`],
			});
			end();
		},
		Number(process.env.FAKE_EDS_DELAY || 0),
	);
} else if (cmd === "draft" && sub === "refine") {
	const i = rest.indexOf("--");
	out({
		type: "draft",
		name: rest[i + 1],
		version: 2,
		ok: true,
		dir: "x",
		files: [],
		feedback: rest[i + 2],
	});
	end();
} else if (cmd === "draft" && sub === "preview") {
	const port = Number(rest[rest.indexOf("--port") + 1]);
	const version = /^\d+$/.test(rest[3] ?? "") ? Number(rest[3]) : 1;
	const srv = http.createServer((_req, res) => res.end(`preview of ${rest[2]} v${version}`));
	srv.listen(port, "127.0.0.1", () => {
		out({ type: "preview", name: rest[2], url: `http://127.0.0.1:${port}/`, version });
	});
	process.on("SIGTERM", () => {
		srv.close();
		end();
	});
} else if (cmd === "draft" && sub === "accept") {
	const branch = rest.includes("--branch") ? rest[rest.indexOf("--branch") + 1] : undefined;
	out({
		type: "accepted",
		name: rest[2],
		version: 1,
		...(branch ? { commit: "abc1234", branch } : {}),
	});
	end();
} else if (cmd === "draft" && sub === "discard") {
	out({ type: "discarded", name: rest[2] });
	end();
} else {
	out({ type: "log", level: "error", message: `fake eds: unknown command ${rest.join(" ")}` });
	end(false);
}
