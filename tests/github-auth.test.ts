import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubToken } from "../src/server/github.js";
import {
	canSignIn,
	deviceFlowState,
	setTokenStore,
	signOut,
	startDeviceFlow,
	storedToken,
} from "../src/server/github-auth.js";

/** A TokenStore in memory, standing in for the keychain. */
function memoryStore() {
	let token: string | null = null;
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
	it("is off without a Client ID or a keychain", async () => {
		expect(canSignIn()).toBe(false); // no store
		setTokenStore(memoryStore());
		expect(canSignIn()).toBe(true);
		process.env.STUDIO_GITHUB_CLIENT_ID = "";
		expect(canSignIn()).toBe(false);
		await expect(startDeviceFlow()).rejects.toThrow(/isn't set up/);
	});

	it("shows the user code, keeps polling while pending, then stores the token", async () => {
		setTokenStore(memoryStore());
		const calls = fakeGithub([{ error: "authorization_pending" }, { access_token: "gho_abc" }]);
		const f = await startDeviceFlow();
		expect(f).toMatchObject({
			state: "pending",
			userCode: "ABCD-1234",
			verificationUri: "https://github.com/login/device",
		});
		expect(JSON.stringify(f)).not.toContain("dev-123"); // the device code stays on the server
		expect(calls[0].body).toContain("client_id=Iv1.test");
		expect(calls[0].body).toContain("scope=repo+read%3Aorg");

		await vi.advanceTimersByTimeAsync(5000);
		expect(deviceFlowState()?.state).toBe("pending");
		await vi.advanceTimersByTimeAsync(5000);
		expect(deviceFlowState()?.state).toBe("done");
		expect(await storedToken()).toBe("gho_abc");
		expect(await githubToken()).toBe("gho_abc"); // the app's own sign-in comes first
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
