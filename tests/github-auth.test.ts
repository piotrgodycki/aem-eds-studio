import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubToken, listPulls, listRepos } from "../src/server/github.js";
import {
	canSignIn,
	clientId,
	deviceFlowState,
	setTokenStore,
	signOut,
	startDeviceFlow,
	storedToken,
} from "../src/server/github-auth.js";

/** A TokenStore in memory, standing in for the keychain. */
function memoryStore(initial: string | null = null) {
	let token = initial;
	return {
		read: async () => token,
		write: async (t: string) => {
			token = t;
		},
		clear: async () => {
			token = null;
		},
	};
}

/** GitHub's device flow endpoints: the device code, then the given answers to each poll. */
function fakeGithub(polls: Array<Record<string, string>>) {
	const calls: Array<{ url: string; body: string }> = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: { body: URLSearchParams }) => {
			calls.push({ url, body: String(init.body) });
			const json = url.endsWith("/login/device/code")
				? {
						device_code: "dev-123",
						user_code: "ABCD-1234",
						verification_uri: "https://github.com/login/device",
						expires_in: 900,
						interval: 5,
					}
				: (polls.shift() ?? { error: "authorization_pending" });
			return new Response(JSON.stringify(json), { status: 200 });
		}),
	);
	return calls;
}

beforeEach(() => {
	vi.useFakeTimers();
	process.env.STUDIO_GITHUB_CLIENT_ID = "Iv1.test";
	process.env.GITHUB_TOKEN = "";
	process.env.GH_TOKEN = "";
});
afterEach(async () => {
	await signOut();
	setTokenStore(null);
	vi.useRealTimers();
	vi.unstubAllGlobals();
	process.env.STUDIO_GITHUB_CLIENT_ID = "";
});

describe("Connect GitHub (device flow)", () => {
	it("uses the studio's GitHub App, and is off without a keychain", async () => {
		process.env.STUDIO_GITHUB_CLIENT_ID = ""; // the build's own, not the tests' override
		expect(clientId()).toBe("Iv23liUxSiQhb4ma5CnD");
		expect(canSignIn()).toBe(false); // no store
		await expect(startDeviceFlow()).rejects.toThrow(/isn't set up/);
		setTokenStore(memoryStore());
		expect(canSignIn()).toBe(true);
	});

	it("shows the user code, keeps polling while pending, then stores the token", async () => {
		setTokenStore(memoryStore());
		const calls = fakeGithub([
			{ error: "authorization_pending" },
			{ access_token: "ghu_abc", expires_in: "28800", refresh_token: "ghr_abc" },
		]);
		const f = await startDeviceFlow();
		expect(f).toMatchObject({
			state: "pending",
			userCode: "ABCD-1234",
			verificationUri: "https://github.com/login/device",
		});
		expect(JSON.stringify(f)).not.toContain("dev-123"); // the device code stays on the server
		expect(calls[0].body).toContain("client_id=Iv1.test");
		expect(calls[0].body).not.toContain("scope"); // a GitHub App's permissions are set on the app

		await vi.advanceTimersByTimeAsync(5000);
		expect(deviceFlowState()?.state).toBe("pending");
		await vi.advanceTimersByTimeAsync(5000);
		expect(deviceFlowState()?.state).toBe("done");
		expect(await storedToken()).toEqual({ token: "ghu_abc", signedIn: true });
		expect(await githubToken()).toBe("ghu_abc"); // the app's own sign-in comes first
		expect(calls[1].body).toContain(
			"grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code",
		);

		await signOut();
		expect(await storedToken()).toBeNull();
	});

	it("slows down when GitHub asks, and reports a denied sign-in", async () => {
		setTokenStore(memoryStore());
		const calls = fakeGithub([{ error: "slow_down" }, { error: "access_denied" }]);
		await startDeviceFlow();
		await vi.advanceTimersByTimeAsync(5000); // slow_down: next poll after 10 s
		await vi.advanceTimersByTimeAsync(9000);
		expect(calls.length).toBe(2);
		await vi.advanceTimersByTimeAsync(1000);
		expect(deviceFlowState()?.state).toBe("denied");
		expect(await storedToken()).toBeNull();
	});
});

describe("GitHub refusing the sign-in", () => {
	it("shows what GitHub said, and names an unknown app", async () => {
		setTokenStore(memoryStore());
		const answer = (status: number, body: string) =>
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(body, { status })),
			);
		answer(
			400,
			JSON.stringify({
				error: "device_flow_disabled",
				error_description: "Device Flow must be explicitly enabled for this App",
			}),
		);
		await expect(startDeviceFlow()).rejects.toThrow(
			"GitHub 400: Device Flow must be explicitly enabled for this App",
		);
		answer(404, "Not Found");
		await expect(startDeviceFlow()).rejects.toThrow(/doesn't know the studio's app/);
	});
});

describe("the GitHub App's tokens", () => {
	it("renews an expiring token with the refresh token, once for requests at the same time", async () => {
		const expired = JSON.stringify({
			access: "ghu_old",
			refresh: "ghr_old",
			expiresAt: Date.now(),
		});
		const keychain = memoryStore(expired);
		setTokenStore(keychain);
		const calls = fakeGithub([
			{ access_token: "ghu_new", expires_in: "28800", refresh_token: "ghr_new" },
		]);
		const [a, b] = await Promise.all([githubToken(), githubToken()]);
		expect([a, b]).toEqual(["ghu_new", "ghu_new"]);
		expect(calls).toHaveLength(1);
		expect(calls[0].body).toContain("grant_type=refresh_token");
		expect(calls[0].body).toContain("refresh_token=ghr_old");
		expect(calls[0].body).not.toContain("client_secret");
		expect(JSON.parse((await keychain.read()) ?? "")).toMatchObject({ refresh: "ghr_new" });
	});

	it("asks to connect again when GitHub refuses the refresh token", async () => {
		setTokenStore(memoryStore(JSON.stringify({ access: "a", refresh: "r", expiresAt: 1 })));
		fakeGithub([{ error: "bad_refresh_token" }]);
		expect(await githubToken()).toBeNull();
	});

	it("lists only the repositories the app is installed on", async () => {
		setTokenStore(memoryStore(JSON.stringify({ access: "ghu_abc" })));
		const repo = (name: string, pushed: string) => ({
			full_name: name,
			private: true,
			default_branch: "main",
			pushed_at: pushed,
			description: null,
		});
		const urls: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				urls.push(url);
				const json = url.includes("/user/installations?")
					? { installations: [{ id: 1 }, { id: 2 }] }
					: url.includes("/installations/1/")
						? { repositories: [repo("me/old", "2026-01-01")] }
						: { repositories: [repo("org/new", "2026-11-01")] };
				return new Response(JSON.stringify(json), { status: 200 });
			}),
		);
		expect((await listRepos()).map((r) => r.fullName)).toEqual(["org/new", "me/old"]);
		expect(urls.some((u) => u.includes("/user/repos"))).toBe(false);
	});
});

describe("pull requests", () => {
	it("gives each one a status: open, draft, merged or closed", async () => {
		setTokenStore(memoryStore("github_pat_abc"));
		const pr = (number: number, state: string, extra = {}) => ({
			number,
			title: `PR ${number}`,
			state,
			draft: false,
			merged_at: null,
			html_url: `https://github.com/o/r/pull/${number}`,
			user: { login: "me" },
			updated_at: "2026-11-12T10:00:00Z",
			...extra,
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json([
					pr(1, "open"),
					pr(2, "open", { draft: true }),
					pr(3, "closed", { merged_at: "2026-11-11T10:00:00Z" }),
					pr(4, "closed"),
				]),
			),
		);
		expect((await listPulls("o/r"))?.map((p) => p.status)).toEqual([
			"open",
			"draft",
			"merged",
			"closed",
		]);
	});

	it("is null without GitHub access", async () => {
		setTokenStore(memoryStore());
		expect(await listPulls("o/r")).toBeNull();
	});
});

describe("which GitHub token the studio uses", () => {
	it("keeps a pasted token as it is", async () => {
		setTokenStore(memoryStore("github_pat_abc"));
		expect(await storedToken()).toEqual({ token: "github_pat_abc", signedIn: false });
	});

	it("in the desktop app, only what the user gave it; GITHUB_TOKEN only in the browser mode", async () => {
		process.env.GITHUB_TOKEN = "ghp_from_the_shell";
		expect(await githubToken()).toBe("ghp_from_the_shell"); // browser mode: no keychain
		setTokenStore(memoryStore());
		expect(await githubToken()).toBeNull(); // desktop: nothing given yet, the shell's is ignored
		process.env.GITHUB_TOKEN = "";
	});
});
