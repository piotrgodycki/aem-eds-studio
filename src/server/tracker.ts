/**
 * The team's tracker when it isn't GitHub Issues: Jira or Azure DevOps. A QA
 * report opens a Bug there with its screenshot attached. The token is kept in
 * the system keychain per project (desktop app), never sent to the page, and
 * only goes to the tracker. EDS_TRACKER_TOKEN still works, for the browser mode.
 */

import type { TokenStore } from "./github-auth.js";
import { log } from "./log.js";
import { InputError } from "./validate.js";

/** Jira's project key is the project's ticket key (STUDIO in STUDIO-12). */
export type Tracker =
	| { kind: "jira"; site: string; email: string }
	| { kind: "ado"; org: string; project: string };

let storeFor: ((name: string) => TokenStore) | null = null;
export function setTrackerTokenStores(make: ((name: string) => TokenStore) | null) {
	storeFor = make;
}
const store = (projectId: string) => storeFor?.(`tracker-${projectId}`) ?? null;
const saved = async (projectId: string) =>
	(await store(projectId)
		?.read()
		.catch(() => null)) || undefined;

export async function trackerToken(projectId: string): Promise<string | undefined> {
	return (await saved(projectId)) || process.env.EDS_TRACKER_TOKEN || undefined;
}

export async function trackerTokenStatus(projectId: string) {
	return {
		saved: !!(await saved(projectId)),
		env: !!process.env.EDS_TRACKER_TOKEN,
		canSave: !!storeFor,
	};
}

export async function saveTrackerToken(projectId: string, token: unknown): Promise<void> {
	const s = store(projectId);
	if (!s)
		throw new InputError("Saving a token needs the desktop app; here, set EDS_TRACKER_TOKEN.");
	if (typeof token !== "string" || !/^\S{8,500}$/.test(token.trim()))
		throw new InputError("That doesn't look like a token.");
	await s.write(token.trim());
}

export async function clearTrackerToken(projectId: string): Promise<void> {
	await store(projectId)?.clear();
}

/** An https address on the service's own host, without a trailing slash. */
function serviceUrl(v: unknown, host: RegExp, example: string): string {
	try {
		const url = new URL(String(v ?? "").trim());
		if (url.protocol === "https:" && host.test(url.hostname))
			return url.origin + url.pathname.replace(/\/+$/, "");
	} catch {
		// An address that doesn't parse gets the same message as a wrong host.
	}
	throw new InputError(`The address is like ${example}.`);
}

/** The tracker settings, checked; empty clears them. */
export function tracker(v: unknown): Tracker | undefined {
	if (v === undefined || v === null || v === "") return undefined;
	const t = v as Record<string, unknown>;
	if (t.kind === "jira") {
		const email = String(t.email ?? "").trim();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
			throw new InputError("Jira needs the email of the token's account.");
		const site = serviceUrl(t.site, /^[a-z0-9-]+\.atlassian\.net$/, "https://acme.atlassian.net");
		return { kind: "jira", site: new URL(site).origin, email };
	}
	if (t.kind === "ado") {
		const project = String(t.project ?? "").trim();
		if (!/^[\w .-]{1,64}$/.test(project)) throw new InputError("Name the Azure DevOps project.");
		const org = serviceUrl(t.org, /^dev\.azure\.com$/, "https://dev.azure.com/acme");
		if (!/^https:\/\/dev\.azure\.com\/[\w.-]+$/.test(org))
			throw new InputError("The address is like https://dev.azure.com/acme.");
		return { kind: "ado", org, project };
	}
	throw new InputError("Pick Jira or Azure DevOps.");
}

interface Bug {
	title: string;
	/** Jira wiki markup for Jira, HTML for Azure DevOps. */
	body: string;
	screenshot: { name: string; png: Buffer };
}

async function ok(res: Response, what: string): Promise<Response> {
	if (res.ok) return res;
	log.warn(`${what}: ${res.status} ${(await res.text()).slice(0, 300)}`);
	throw new Error(
		`${what} failed (${res.status}). Check the tracker's address, project and token.`,
	);
}

/** Open a Bug in Jira with the screenshot attached: its key (STUDIO-12) and page. */
async function jiraBug(
	t: Extract<Tracker, { kind: "jira" }>,
	key: string,
	token: string,
	bug: Bug,
	f: typeof fetch,
) {
	const auth = `Basic ${Buffer.from(`${t.email}:${token}`).toString("base64")}`;
	const res = await f(`${t.site}/rest/api/2/issue`, {
		method: "POST",
		headers: {
			authorization: auth,
			"content-type": "application/json",
			accept: "application/json",
		},
		body: JSON.stringify({
			fields: {
				project: { key },
				summary: bug.title,
				description: bug.body,
				issuetype: { name: "Bug" },
			},
		}),
	});
	const created = (await (await ok(res, "Jira: opening the issue")).json()) as { key: string };
	const form = new FormData();
	form.append(
		"file",
		new Blob([new Uint8Array(bug.screenshot.png)], { type: "image/png" }),
		bug.screenshot.name,
	);
	const attached = await f(
		`${t.site}/rest/api/2/issue/${encodeURIComponent(created.key)}/attachments`,
		{
			method: "POST",
			// Jira refuses attachment uploads without it (its guard against cross-site requests).
			headers: { authorization: auth, "X-Atlassian-Token": "no-check" },
			body: form,
		},
	);
	await ok(attached, "Jira: attaching the screenshot");
	return { label: created.key, url: `${t.site}/browse/${encodeURIComponent(created.key)}` };
}

/** Open a Bug work item in Azure DevOps with the screenshot attached and shown in it. */
async function adoBug(
	t: Extract<Tracker, { kind: "ado" }>,
	token: string,
	bug: Bug,
	f: typeof fetch,
) {
	const auth = `Basic ${Buffer.from(`:${token}`).toString("base64")}`;
	const base = `${t.org}/${encodeURIComponent(t.project)}/_apis/wit`;
	const uploaded = await f(
		`${base}/attachments?fileName=${encodeURIComponent(bug.screenshot.name)}&api-version=7.1`,
		{
			method: "POST",
			headers: { authorization: auth, "content-type": "application/octet-stream" },
			body: new Uint8Array(bug.screenshot.png),
		},
	);
	const image = (await (await ok(uploaded, "Azure DevOps: uploading the screenshot")).json()) as {
		url: string;
	};
	const res = await f(`${base}/workitems/$Bug?api-version=7.1`, {
		method: "POST",
		headers: { authorization: auth, "content-type": "application/json-patch+json" },
		body: JSON.stringify([
			{ op: "add", path: "/fields/System.Title", value: bug.title },
			{
				op: "add",
				path: "/fields/Microsoft.VSTS.TCM.ReproSteps",
				value: `${bug.body}<p><img src="${image.url}" alt="Screenshot"></p>`,
			},
			{ op: "add", path: "/relations/-", value: { rel: "AttachedFile", url: image.url } },
		]),
	});
	const item = (await (await ok(res, "Azure DevOps: opening the work item")).json()) as {
		id: number;
	};
	return {
		label: `Work item ${item.id}`,
		url: `${t.org}/${encodeURIComponent(t.project)}/_workitems/edit/${item.id}`,
	};
}

/** Open a Bug in the project's tracker. `key` is the project's ticket key (Jira's project). */
export async function openBug(
	t: Tracker,
	key: string | undefined,
	token: string,
	bug: Bug,
	f: typeof fetch = fetch,
): Promise<{ label: string; url: string }> {
	if (t.kind === "ado") return adoBug(t, token, bug, f);
	if (!key) throw new InputError("Set the ticket key first: it is the Jira project's key.");
	return jiraBug(t, key, token, bug, f);
}
