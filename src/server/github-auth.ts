/**
 * "Connect GitHub" without a client secret: GitHub's OAuth device flow.
 * The studio asks GitHub for a short code, the user enters it on github.com,
 * and the studio polls until GitHub hands over a token. The token goes to a
 * TokenStore (the desktop app's is the system keychain through Electron's
 * safeStorage) and never to the page.
 *
 * The OAuth App's Client ID is public. Until one is configured, sign-in is off
 * and the studio uses GITHUB_TOKEN or the GitHub CLI, as before.
 */

/** The aem-eds-studio OAuth App (device flow enabled). Public; set once the app is registered. */
const BUILT_IN_CLIENT_ID = "";

export const clientId = () => process.env.STUDIO_GITHUB_CLIENT_ID || BUILT_IN_CLIENT_ID;

/** Repositories (clone, branches, PRs, issues) and the user's organisations' repos. */
const SCOPE = "repo read:org";

export interface TokenStore {
	read(): Promise<string | null>;
	write(token: string): Promise<void>;
	clear(): Promise<void>;
}

let store: TokenStore | null = null;
export function setTokenStore(s: TokenStore | null) {
	store = s;
}

export const canSignIn = () => !!clientId() && !!store;

export async function storedToken(): Promise<string | null> {
	return store ? store.read().catch(() => null) : null;
}

export interface DeviceFlow {
	state: "pending" | "done" | "expired" | "denied" | "error";
	userCode: string;
	verificationUri: string;
	expiresAt: number;
	error?: string;
}

let flow: DeviceFlow | null = null;
let timer: NodeJS.Timeout | undefined;

async function post<T>(url: string, params: Record<string, string>): Promise<T> {
	const res = await fetch(url, {
		method: "POST",
		headers: {
			accept: "application/json",
			"content-type": "application/x-www-form-urlencoded",
			"user-agent": "aem-eds-studio",
		},
		body: new URLSearchParams(params),
	});
	if (!res.ok) throw new Error(`GitHub ${res.status}`);
	return (await res.json()) as T;
}

/** Starts a sign-in; the code and the page to enter it on go to the user, the device code stays here. */
export async function startDeviceFlow(): Promise<DeviceFlow> {
	if (!canSignIn()) throw new Error("Sign-in to GitHub isn't set up in this build.");
	cancelDeviceFlow();
	const r = await post<{
		device_code?: string;
		user_code?: string;
		verification_uri?: string;
		expires_in?: number;
		interval?: number;
		error_description?: string;
	}>("https://github.com/login/device/code", { client_id: clientId(), scope: SCOPE });
	if (!r.device_code || !r.user_code || !r.verification_uri)
		throw new Error(r.error_description ?? "GitHub didn't start the sign-in.");

	const current: DeviceFlow = {
		state: "pending",
		userCode: r.user_code,
		verificationUri: r.verification_uri,
		expiresAt: Date.now() + (r.expires_in ?? 900) * 1000,
	};
	flow = current;
	let interval = (r.interval ?? 5) * 1000;
	const deviceCode = r.device_code;

	const poll = async () => {
		if (flow !== current) return;
		if (Date.now() > current.expiresAt) {
			current.state = "expired";
			return;
		}
		try {
			const t = await post<{ access_token?: string; error?: string; error_description?: string }>(
				"https://github.com/login/oauth/access_token",
				{
					client_id: clientId(),
					device_code: deviceCode,
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				},
			);
			if (flow !== current) return;
			if (t.access_token) {
				try {
					await store?.write(t.access_token);
					current.state = "done";
				} catch (err) {
					current.state = "error";
					current.error = (err as Error).message;
				}
				return;
			}
			if (t.error === "slow_down") interval += 5000;
			else if (t.error === "expired_token") {
				current.state = "expired";
				return;
			} else if (t.error === "access_denied") {
				current.state = "denied";
				return;
			} else if (t.error && t.error !== "authorization_pending") {
				current.state = "error";
				current.error = t.error_description ?? t.error;
				return;
			}
		} catch {
			// A network blip: try again on the next tick.
		}
		timer = setTimeout(poll, interval);
	};
	timer = setTimeout(poll, interval);
	return { ...current };
}

export function deviceFlowState(): DeviceFlow | null {
	return flow ? { ...flow } : null;
}

export function cancelDeviceFlow() {
	clearTimeout(timer);
	flow = null;
}

/** Forgets the token the studio signed in with (GITHUB_TOKEN and gh are not touched). */
export async function signOut() {
	cancelDeviceFlow();
	await store?.clear();
}
