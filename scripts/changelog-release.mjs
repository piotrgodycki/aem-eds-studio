#!/usr/bin/env node
// Moves the CHANGELOG's Unreleased section under a new version, with its date
// and compare links. Used by the Release workflow:
//   node scripts/changelog-release.mjs <version> [YYYY-MM-DD] [file]
import { readFileSync, writeFileSync } from "node:fs";

const REPO = "https://github.com/piotrgodycki/aem-eds-studio";

/** The CHANGELOG with Unreleased released as `version`. Throws when Unreleased is empty. */
export function release(text, version, date) {
	const head = "## [Unreleased]\n";
	const start = text.indexOf(head);
	if (start < 0) throw new Error("No ## [Unreleased] section.");
	const next = text.indexOf("\n## [", start + head.length);
	const body = text.slice(start + head.length, next < 0 ? undefined : next).trim();
	if (!body) throw new Error("Nothing under ## [Unreleased] to release.");

	let out = text.replace(head, `${head}\n## [${version}] - ${date}\n`);
	const prev = out.match(/^\[Unreleased\]: .*\/compare\/v([^.]+\.[^.]+\.[^.]+)\.\.\.main$/m)?.[1];
	out = out.replace(
		/^\[Unreleased\]: .*$/m,
		`[Unreleased]: ${REPO}/compare/v${version}...main\n[${version}]: ${REPO}/compare/v${prev}...v${version}`,
	);
	return out;
}

/** The release notes: the version's section, without its heading. */
export function notes(text, version) {
	const head = `## [${version}]`;
	const start = text.indexOf(head);
	if (start < 0) return "";
	const from = text.indexOf("\n", start) + 1;
	const rest = text.slice(from);
	// Up to the next version, or the link definitions at the end.
	const end = rest.search(/\n## \[|\n\[[^\]]+\]: /);
	return (end < 0 ? rest : rest.slice(0, end)).trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const [version, date = new Date().toISOString().slice(0, 10), file = "CHANGELOG.md"] =
		process.argv.slice(2);
	if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
		console.error("usage: changelog-release.mjs <x.y.z> [YYYY-MM-DD] [file]");
		process.exit(2);
	}
	writeFileSync(file, release(readFileSync(file, "utf-8"), version, date));
}
