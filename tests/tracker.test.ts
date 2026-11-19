import { describe, expect, it } from "vitest";
import { htmlBody, jiraBody, type QaReport } from "../src/server/qa-report.js";
import { openTicket, tracker } from "../src/server/tracker.js";

const report: QaReport = {
	block: "hero",
	selector: "div.hero > h1",
	device: "Phone",
	text: "The title <wraps> too early",
	values: { color: "rgb(0, 0, 0)" },
};
const bug = {
	type: "Bug" as const,
	title: "QA: hero h1",
	body: "Body",
	screenshot: { name: "hero.png", png: Buffer.from("png") },
};

/** A stand-in for fetch that records each request and answers in turn. */
function fakeFetch(answers: unknown[]) {
	const calls: Array<{ url: string; init: RequestInit }> = [];
	const f = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return new Response(JSON.stringify(answers[calls.length - 1]), { status: 201 });
	}) as unknown as typeof fetch;
	return { f, calls };
}

describe("the project's tracker", () => {
	it("checks the settings: the services' own https hosts", () => {
		expect(
			tracker({ kind: "jira", site: "https://acme.atlassian.net/", email: "qa@acme.com" }),
		).toEqual({
			kind: "jira",
			site: "https://acme.atlassian.net",
			email: "qa@acme.com",
		});
		expect(
			tracker({ kind: "ado", org: "https://dev.azure.com/acme", project: "Web site" }),
		).toEqual({
			kind: "ado",
			org: "https://dev.azure.com/acme",
			project: "Web site",
		});
		expect(() =>
			tracker({ kind: "jira", site: "https://evil.example", email: "qa@acme.com" }),
		).toThrow("atlassian.net");
		expect(() =>
			tracker({ kind: "ado", org: "http://dev.azure.com/acme", project: "Web" }),
		).toThrow();
		expect(tracker(null)).toBeUndefined();
	});

	it("opens a Jira Bug in the ticket key's project and attaches the screenshot", async () => {
		const { f, calls } = fakeFetch([{ key: "STUDIO-12" }, []]);
		const t = { kind: "jira" as const, site: "https://acme.atlassian.net", email: "qa@acme.com" };
		expect(await openTicket(t, "STUDIO", "token123", bug, f)).toEqual({
			label: "STUDIO-12",
			url: "https://acme.atlassian.net/browse/STUDIO-12",
		});
		expect(JSON.parse(String(calls[0].init.body)).fields).toMatchObject({
			project: { key: "STUDIO" },
			issuetype: { name: "Bug" },
		});
		expect(calls[1].url).toBe("https://acme.atlassian.net/rest/api/2/issue/STUDIO-12/attachments");
		expect((calls[1].init.headers as Record<string, string>)["X-Atlassian-Token"]).toBe("no-check");
		await expect(openTicket(t, undefined, "token123", bug, f)).rejects.toThrow("ticket key");
	});

	it("opens an Azure DevOps Bug with the uploaded screenshot shown and attached", async () => {
		const image = "https://dev.azure.com/acme/_apis/wit/attachments/abc";
		const { f, calls } = fakeFetch([{ url: image }, { id: 42 }]);
		const t = { kind: "ado" as const, org: "https://dev.azure.com/acme", project: "Web site" };
		expect(await openTicket(t, undefined, "token123", bug, f)).toEqual({
			label: "Work item 42",
			url: "https://dev.azure.com/acme/Web%20site/_workitems/edit/42",
		});
		expect(calls[1].url).toContain("/Web%20site/_apis/wit/workitems/$Bug");
		const patch = JSON.parse(String(calls[1].init.body));
		expect(patch[1].value).toContain(`<img src="${image}"`);
		expect(patch[2].value).toEqual({ rel: "AttachedFile", url: image });
	});

	it("opens a Task with no screenshot: no upload, the text in its Description", async () => {
		const task = { type: "Task" as const, title: "Price on the hero", body: "<p>Why</p>" };
		const jira = fakeFetch([{ key: "STUDIO-13" }]);
		const t = { kind: "jira" as const, site: "https://acme.atlassian.net", email: "qa@acme.com" };
		expect((await openTicket(t, "STUDIO", "token123", task, jira.f)).label).toBe("STUDIO-13");
		expect(jira.calls).toHaveLength(1);
		expect(JSON.parse(String(jira.calls[0].init.body)).fields.issuetype).toEqual({ name: "Task" });

		const ado = fakeFetch([{ id: 43 }]);
		const a = { kind: "ado" as const, org: "https://dev.azure.com/acme", project: "Web" };
		expect((await openTicket(a, undefined, "token123", task, ado.f)).label).toBe("Work item 43");
		expect(ado.calls).toHaveLength(1);
		expect(ado.calls[0].url).toContain("/workitems/$Task");
		const patch = JSON.parse(String(ado.calls[0].init.body));
		expect(patch[1]).toEqual({
			op: "add",
			path: "/fields/System.Description",
			value: "<p>Why</p>",
		});
		expect(patch).toHaveLength(2);
	});

	it("writes the report for each tracker, with the page's text kept as text", () => {
		expect(htmlBody(report)).toContain("The title &lt;wraps&gt; too early");
		expect(htmlBody(report)).toContain("<code>div.hero &gt; h1</code>");
		expect(jiraBody(report)).toContain("{{div.hero > h1}}");
		expect(jiraBody(report)).toContain("|Colour|rgb(0, 0, 0)|");
	});
});
