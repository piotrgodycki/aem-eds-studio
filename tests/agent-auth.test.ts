import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	asksForCode,
	authState,
	cancelAuth,
	sendAuthCode,
	signInUrl,
	startAuth,
} from "../src/server/agent-auth.js";
import { createApp } from "../src/server/app.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fake = {
	claude: {
		name: "Claude Code",
		command: process.execPath,
		args: [path.join(here, "fixtures", "fake-login.mjs")],
	},
};
const until = async (ok: () => boolean) => {
	for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 50));
};

describe("agent sign-in with the provider", () => {
	afterEach(() => cancelAuth("claude"));

	it("reads the sign-in link and the code prompt", () => {
		expect(signInUrl("visit: https://claude.com/oauth/authorize?a=1 now")).toBe(
			"https://claude.com/oauth/authorize?a=1",
		);
		expect(signInUrl("http://evil.example")).toBeUndefined();
		expect(asksForCode("Paste code here if prompted >")).toBe(true);
		expect(asksForCode("Opening browser to sign in…")).toBe(false);
	});

	it("runs the login, passes the code and ends signed in", async () => {
		const s = startAuth("claude", fake);
		expect(s.status).toBe("waiting");
		await until(() => !!authState("claude").askCode);
		expect(authState("claude").url).toMatch(/^https:\/\/claude\.com\/oauth/);
		sendAuthCode("claude", "good-code");
		await until(() => authState("claude").status !== "waiting");
		expect(authState("claude").status).toBe("done");
	});

	it("reports a wrong code with the CLI's own message", async () => {
		startAuth("claude", fake);
		await until(() => !!authState("claude").askCode);
		sendAuthCode("claude", "nope");
		await until(() => authState("claude").status !== "waiting");
		expect(authState("claude")).toMatchObject({ status: "error", error: "Invalid code." });
	});

	it("says when the agent isn't installed", async () => {
		startAuth("claude", { claude: { name: "Claude Code", command: "no-such-cli-xyz", args: [] } });
		await until(() => authState("claude").status !== "waiting");
		expect(authState("claude").error).toMatch(/isn't installed/);
	});

	it("accepts only the known agents", async () => {
		const app = createApp({ webDir: undefined });
		const res = await app.request("http://127.0.0.1:4600/api/agents/bash/login", {
			method: "POST",
			headers: { host: "127.0.0.1:4600", "content-type": "application/json" },
			body: "{}",
		});
		expect(res.status).toBe(400);
	});
});
