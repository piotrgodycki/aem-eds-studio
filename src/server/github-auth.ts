/**
 * "Connect GitHub" without a client secret: the device flow of the GitHub App
 * "AEM EDS Studio". The studio asks GitHub for a short code, the user enters it
 * on github.com, and the studio polls until GitHub hands over a token. The
 * token goes to a TokenStore (the desktop app's is the system keychain through
 * Electron's safeStorage) and never to the page.
 *
 * A GitHub App, unlike an OAuth App, reaches only the repositories the user
 * installed it on, with the app's permissions. Its tokens expire after 8 hours;
 * the refresh token renews them, and for the device flow that needs no secret.
 */
import { InputError } from "./validate.js";

/** The GitHub App "AEM EDS Studio" (device flow on). Its Client ID is public. */
const BUILT_IN_CLIENT_ID = "Iv23liUxSiQhb4ma5CnD";
const APP_SLUG = "aem-eds-studio";

export const clientId = () => process.env.STUDIO_GITHUB_CLIENT_ID || BUILT_IN_CLIENT_ID;

/** Where the user installs the app and picks its repositories, or changes the pick. */
export const installUrl = `https://github.com/apps/${APP_SLUG}/installations/new`;

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

/**
 * What the store holds: a token pasted in Settings as it is, or the sign-in's
 * token with its refresh token, as JSON.
 */
interface SignIn {
	access: string;
	refresh?: string;
	expiresAt?: number;
}

interface TokenAnswer {
	access_token?: string;
	expires_in?: number;
	refresh_token?: string;
	error?: string;
	error_description?: string;
}

function signInFrom(t: TokenAnswer): SignIn {
	return {
		access: t.access_token ?? "",
		refresh: t.refresh_token,
		expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined,
	};
}

let refreshing: Promise<SignIn | null> | null = null;

/** One refresh at a time: two requests at once would spend the same refresh token twice. */
function refresh(old: SignIn): Promise<SignIn | null> {
	refreshing ??= post<TokenAnswer>("https://github.com/login/oauth/access_token", {
		client_id: clientId(),
		grant_type: "refresh_token",
		refresh_token: old.refresh ?? "",
	})
		.then(async (t) => {
			if (!t.access_token) return null; // e.g. bad_refresh_token: connect again
			const next = signInFrom(t);
			await store?.write(JSON.stringify(next));
			return next;
		})
		.catch(() => null)
		.finally(() => {
			refreshing = null;
		});
	return refreshing;
}

/** The token the user gave the studio, renewed when it is about to expire. */
export async function storedToken(): Promise<{ token: string; signedIn: boolean } | null> {
	const raw = store ? await store.read().catch(() => null) : null;
	if (!raw) return null;
	if (!raw.startsWith("{")) return { token: raw, signedIn: false };
	let s = JSON.parse(raw) as SignIn;
	if (s.expiresAt && s.refresh && Date.now() > s.expiresAt - 60_000) {
		const next = await refresh(s);
		if (!next) return null;
		s = next;
	}
	return { token: s.access, signedIn: true };
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
	if (!res.ok) throw new Error(await githubError(res));
	return (await res.json()) as T;
}

/** What GitHub said when it refused, so a wrong Client ID reads differently from a closed device flow. */
async function githubError(res: Response): Promise<string> {
	const body = (await res.json().catch(() => ({}))) as {
		error?: string;
		error_description?: string;
		message?: string;
	};
	const said = body.error_description ?? body.message ?? body.error;
	if (said) return `GitHub ${res.status}: ${said}`;
	if (res.status === 404)
		return "GitHub 404: it doesn't know the studio's app. Check its Client ID.";
	return `GitHub ${res.status}`;
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
	}>("https://github.com/login/device/code", { client_id: clientId() });
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
			const t = await post<TokenAnswer>("https://github.com/login/oauth/access_token", {
				client_id: clientId(),
				device_code: deviceCode,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			});
			if (flow !== current) return;
			if (t.access_token) {
				try {
					await store?.write(JSON.stringify(signInFrom(t)));
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

/** Whether a token can be kept here (the desktop app's keychain). */
export const canSaveToken = () => !!store;

/** Keep a token the user pasted in Settings, like one from "Connect GitHub". */
export async function saveToken(token: string) {
	if (!store)
		throw new InputError("Saving a token needs the desktop app; here, use gh or GITHUB_TOKEN.");
	await store.write(token);
}

/** Forgets the token the user gave the studio (GITHUB_TOKEN is not touched). */
export async function signOut() {
	cancelDeviceFlow();
	await store?.clear();
}
