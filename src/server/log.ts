/**
 * The studio's own log: what it did and what went wrong, so you can tell
 * whether it works. Lines go to ~/.aem-eds-studio/logs/studio.log (rotated,
 * a few files kept) and to a short in-memory list Settings → Logs reads.
 * Anything that looks like a token is masked before it is written.
 */

import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { studioHome } from "./paths.js";

export type Level = "info" | "warn" | "error";

export interface LogLine {
	/** Counts up from the studio's start: a stable key for the page. */
	id: number;
	at: string;
	level: Level;
	message: string;
}

const MAX_BYTES = 2 * 1024 * 1024;
const KEEP_FILES = 3;
const KEEP_LINES = 500;
const recent: LogLine[] = [];
let lastId = 0;

export const logDir = () => path.join(studioHome(), "logs");
const logFile = () => path.join(logDir(), "studio.log");

/** GitHub, Figma, OpenAI/Anthropic keys and bearer tokens: never into the log. */
const SECRETS = [
	/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|figd_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,})/g,
	/\b(Bearer|token)\s+[A-Za-z0-9._-]{16,}/gi,
];
export const mask = (text: string) =>
	SECRETS.reduce((t, re) => t.replace(re, (m) => `${m.slice(0, 4)}…[masked]`), text);

function write(level: Level, message: string) {
	const line: LogLine = {
		id: ++lastId,
		at: new Date().toISOString(),
		level,
		message: mask(message),
	};
	recent.push(line);
	if (recent.length > KEEP_LINES) recent.shift();
	// A broken disk must never break the studio: the log is best effort.
	try {
		mkdirSync(logDir(), { recursive: true });
		rotate();
		appendFileSync(logFile(), `${line.at} ${level.toUpperCase().padEnd(5)} ${line.message}\n`);
	} catch {}
}

/** studio.log → studio.1.log → studio.2.log; the oldest goes. */
function rotate() {
	let size = 0;
	try {
		size = statSync(logFile()).size;
	} catch {
		return;
	}
	if (size < MAX_BYTES) return;
	const file = (n: number) => path.join(logDir(), n ? `studio.${n}.log` : "studio.log");
	rmSync(file(KEEP_FILES - 1), { force: true });
	for (let n = KEEP_FILES - 2; n >= 0; n--) {
		try {
			renameSync(file(n), file(n + 1));
		} catch {}
	}
}

export const log = {
	info: (message: string) => write("info", message),
	warn: (message: string) => write("warn", message),
	error: (message: string) => write("error", message),
};

/** The latest lines, oldest first; `level` keeps that level and worse. */
export function recentLog(level: Level = "info"): LogLine[] {
	const rank = { info: 0, warn: 1, error: 2 };
	return recent.filter((l) => rank[l.level] >= rank[level]);
}
