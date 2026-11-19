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

interface Ticket {
	type: "Feature" | "Bug" | "Task";
	title: string;
	/** Jira wiki markup for Jira, HTML for Azure DevOps. */
	body: string;
	screenshot?: { name: string; png: Buffer };
}

/**
 * The type names a kind may have, tried in order, since Jira projects and Azure
 * DevOps processes name them differently: a Feature is a Story in Jira Software,
 * a User Story (Agile), Product Backlog Item (Scrum) or Issue (Basic) in Azure
 * DevOps, and a Task where nothing else exists.
 */
const TYPE_NAMES: Record<"jira" | "ado", Record<Ticket["type"], string[]>> = {
	jira: { Feature: ["Story", "Task"], Bug: ["Bug", "Task"], Task: ["Task"] },
	ado: {
		Feature: ["User Story", "Product Backlog Item", "Issue", "Task"],
		Bug: ["Bug", "Issue", "Task"],
		Task: ["Task"],
	},
};

async function ok(res: Response, what: string): Promise<Response> {
	if (res.ok) return res;
	log.warn(`${what}: ${res.status} ${(await res.text()).slice(0, 300)}`);
	throw new Error(
		`${what} failed (${res.status}). Check the tracker's address, project and token.`,
	);
}

/** Open an issue in Jira, with the screenshot attached when there is one: its key (STUDIO-12) and page. */
async function jiraTicket(
	t: Extract<Tracker, { kind: "jira" }>,
	key: string,
	token: string,
	bug: Ticket,
	f: typeof fetch,
) {
	const auth = `Basic ${Buffer.from(`${t.email}:${token}`).toString("base64")}`;
	const names = TYPE_NAMES.jira[bug.type];
	let res: Response | undefined;
	for (const [i, name] of names.entries()) {
		res = await f(`${t.site}/rest/api/2/issue`, {
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
					issuetype: { name },
				},
			}),
		});
		// A 400 here is most often a type the project doesn't have: try the next name.
		if (res.status !== 400 || i === names.length - 1) break;
	}
	if (!res) throw new Error("Jira: no issue type to try.");
	const created = (await (await ok(res, "Jira: opening the issue")).json()) as { key: string };
	const page = { label: created.key, url: `${t.site}/browse/${encodeURIComponent(created.key)}` };
	if (!bug.screenshot) return page;
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
	return page;
}

/** Open a work item in Azure DevOps, with the screenshot attached and shown in it when there is one. */
async function adoTicket(
	t: Extract<Tracker, { kind: "ado" }>,
	token: string,
	bug: Ticket,
	f: typeof fetch,
) {
	const auth = `Basic ${Buffer.from(`:${token}`).toString("base64")}`;
	const base = `${t.org}/${encodeURIComponent(t.project)}/_apis/wit`;
	let image: { url: string } | null = null;
	if (bug.screenshot) {
		const uploaded = await f(
			`${base}/attachments?fileName=${encodeURIComponent(bug.screenshot.name)}&api-version=7.1`,
			{
				method: "POST",
				headers: { authorization: auth, "content-type": "application/octet-stream" },
				body: new Uint8Array(bug.screenshot.png),
			},
		);
		image = (await (await ok(uploaded, "Azure DevOps: uploading the screenshot")).json()) as {
			url: string;
		};
	}
	const names = TYPE_NAMES.ado[bug.type];
	let res: Response | undefined;
	for (const [i, name] of names.entries()) {
		// A Bug keeps its text in Repro Steps, every other type in Description.
		const textField =
			name === "Bug" ? "/fields/Microsoft.VSTS.TCM.ReproSteps" : "/fields/System.Description";
		res = await f(`${base}/workitems/$${encodeURIComponent(name)}?api-version=7.1`, {
			method: "POST",
			headers: { authorization: auth, "content-type": "application/json-patch+json" },
			body: JSON.stringify([
				{ op: "add", path: "/fields/System.Title", value: bug.title },
				{
					op: "add",
					path: textField,
					value: image ? `${bug.body}<p><img src="${image.url}" alt="Screenshot"></p>` : bug.body,
				},
				...(image
					? [{ op: "add", path: "/relations/-", value: { rel: "AttachedFile", url: image.url } }]
					: []),
			]),
		});
		// A process without this type answers 404 (or 400): try the next name.
		if ((res.status !== 404 && res.status !== 400) || i === names.length - 1) break;
	}
	if (!res) throw new Error("Azure DevOps: no work item type to try.");
	const item = (await (await ok(res, "Azure DevOps: opening the work item")).json()) as {
		id: number;
	};
	return {
		label: `Work item ${item.id}`,
		url: `${t.org}/${encodeURIComponent(t.project)}/_workitems/edit/${item.id}`,
	};
}

/** Open a ticket in the project's tracker. `key` is the project's ticket key (Jira's project). */
export async function openTicket(
	t: Tracker,
	key: string | undefined,
	token: string,
	ticket: Ticket,
	f: typeof fetch = fetch,
): Promise<{ label: string; url: string }> {
	if (t.kind === "ado") return adoTicket(t, token, ticket, f);
	if (!key) throw new InputError("Set the ticket key first: it is the Jira project's key.");
	return jiraTicket(t, key, token, ticket, f);
}
