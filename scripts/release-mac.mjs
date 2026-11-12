#!/usr/bin/env node
/**
 * The macOS half of a release, signed on the maintainer's Mac so the
 * certificate and the Apple credentials never leave it.
 *
 * The Release workflow leaves vX.Y.Z as a draft with the Windows installer.
 * This builds the macOS app from the same commit, signs it with the Developer
 * ID in the login keychain, notarises it, checks it, smoke-tests it, uploads it
 * and publishes the release.
 *
 *   npm run release:mac -- 0.4.7
 *
 * Needs macOS, the Command Line Tools, the GitHub CLI signed in, and a
 * notarytool profile (docs/releases.md, "Signing the macOS app").
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PROFILE = process.env.APPLE_KEYCHAIN_PROFILE || "aem-eds-notary";
const APP = "release/mac-arm64/AEM EDS Studio.app";

const run = (cmd, args, env = {}) =>
	execFileSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
const read = (cmd, args) => execFileSync(cmd, args, { encoding: "utf-8" }).trim();
function fail(message) {
	throw new Error(message);
}

function main() {
	if (process.platform !== "darwin") fail("Run this on a Mac: it signs with your keychain.");
	const version = (process.argv[2] ?? "").replace(/^v/, "");
	if (!/^\d+\.\d+\.\d+$/.test(version)) fail("Usage: npm run release:mac -- <version>, e.g. 0.4.7");
	const tag = `v${version}`;

	if (
		!read("security", ["find-identity", "-v", "-p", "codesigning"]).includes(
			"Developer ID Application",
		)
	)
		fail("No Developer ID Application certificate with its private key in your keychain.");

	const release = JSON.parse(
		read("gh", ["release", "view", tag, "--json", "isDraft,targetCommitish,assets"]),
	);
	if (!release.isDraft) fail(`${tag} is already published.`);
	if (release.assets.some((a) => a.name.endsWith(".dmg")))
		fail(`${tag} already has the macOS app.`);
	if (read("git", ["status", "--porcelain"])) fail("Commit or stash your changes first.");

	// Build exactly the commit the workflow released, then come back to where you were.
	const branch = read("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
	const before = branch === "HEAD" ? read("git", ["rev-parse", "HEAD"]) : branch;
	run("git", ["fetch", "--quiet", "origin", release.targetCommitish]);
	run("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"]);
	try {
		const built = JSON.parse(readFileSync("package.json", "utf-8")).version;
		if (built !== version) fail(`The release's commit is ${built}, not ${version}.`);

		rmSync("release", { recursive: true, force: true });
		run("npm", ["ci"]);
		run("npm", ["run", "build"]);
		run(
			"npx",
			[
				"electron-builder",
				"--mac",
				"--publish",
				"never",
				// A signed build replaces itself on update (Squirrel.Mac); the app reads this flag.
				"-c.extraMetadata.studioSigned=true",
				"-c.mac.notarize=true",
			],
			{ APPLE_KEYCHAIN_PROFILE: PROFILE },
		);

		// What a user's Mac will check: the signature, the notarisation ticket, Gatekeeper.
		run("codesign", ["--verify", "--deep", "--strict", APP]);
		run("xcrun", ["stapler", "validate", APP]);
		run("spctl", ["--assess", "--type", "execute", APP]);

		// The same smoke test as CI: the server answers and the bundled eds runs.
		const smoke = path.join(tmpdir(), `studio-smoke-${version}.json`);
		rmSync(smoke, { force: true });
		try {
			run(`${APP}/Contents/MacOS/AEM EDS Studio`, [], {
				STUDIO_SMOKE: smoke,
				AEM_EDS_STUDIO_HOME: path.join(tmpdir(), "studio-smoke-home"),
			});
		} catch {
			// The app exits non-zero in smoke mode too; the report says how it went.
		}
		if (!JSON.parse(readFileSync(smoke, "utf-8")).ok)
			fail("The smoke test failed: nothing uploaded.");

		const files = readdirSync("release")
			.filter((f) => /\.(dmg|zip|blockmap)$/.test(f) || f === "latest-mac.yml")
			.map((f) => `release/${f}`);
		run("gh", ["release", "upload", tag, ...files]);
		run("gh", ["release", "edit", tag, "--draft=false"]);
		console.log(`\n✔ ${tag} is out, with the signed macOS app.`);
	} finally {
		run("git", ["checkout", "--quiet", before]);
	}
}

try {
	main();
} catch (err) {
	console.error(`\n✖ ${err.message}`);
	process.exitCode = 1;
}
