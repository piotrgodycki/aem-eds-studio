import { useEffect, useState } from "react";
import { homeTab, readWorkRole } from "./workRole.js";

/**
 * A project opens on its chat; Overview says what it already has, Blocks holds the New block form, Drafts what
 * waits for review, Agents what each agent is doing.
 */
export type ProjectTab =
	| "chat"
	| "overview"
	| "performance"
	| "blocks"
	| "drafts"
	| "board"
	| "agents"
	// The starting screens of the Manager, QA and Content author roles (workRole.ts).
	| "report"
	| "check"
	| "authoring";

const TABS: ProjectTab[] = [
	"overview",
	"performance",
	"blocks",
	"drafts",
	"board",
	"agents",
	"report",
	"check",
	"authoring",
];

export type Route =
	| { page: "projects" }
	| { page: "project"; id: string; tab: ProjectTab; thread?: string; job?: string }
	| { page: "draft"; id: string; name: string }
	| { page: "pair"; code: string };

export function parseRoute(hash: string): Route {
	const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
	if (parts[0] === "pair" && parts[1]) return { page: "pair", code: parts[1] };
	if (parts[0] === "p" && parts[1] && parts[2] === "d" && parts[3])
		return { page: "draft", id: parts[1], name: parts[3] };
	if (parts[0] === "p" && parts[1] && parts[2] === "t" && parts[3])
		return { page: "project", id: parts[1], tab: "chat", thread: parts[3] };
	if (parts[0] === "p" && parts[1] && parts[2] === "agents")
		return { page: "project", id: parts[1], tab: "agents", job: parts[3] };
	if (parts[0] === "p" && parts[1])
		return {
			page: "project",
			id: parts[1],
			tab: TABS.find((t) => t === parts[2]) ?? "chat",
		};
	return { page: "projects" };
}

export const href = {
	projects: () => "#/",
	project: (id: string) => `#/p/${encodeURIComponent(id)}`,
	thread: (id: string, thread: string) =>
		`#/p/${encodeURIComponent(id)}/t/${encodeURIComponent(thread)}`,
	overview: (id: string) => `#/p/${encodeURIComponent(id)}/overview`,
	performance: (id: string) => `#/p/${encodeURIComponent(id)}/performance`,
	blocks: (id: string) => `#/p/${encodeURIComponent(id)}/blocks`,
	drafts: (id: string) => `#/p/${encodeURIComponent(id)}/drafts`,
	agents: (id: string, job?: string) =>
		`#/p/${encodeURIComponent(id)}/agents${job ? `/${encodeURIComponent(job)}` : ""}`,
	board: (id: string) => `#/p/${encodeURIComponent(id)}/board`,
	report: (id: string) => `#/p/${encodeURIComponent(id)}/report`,
	check: (id: string) => `#/p/${encodeURIComponent(id)}/check`,
	authoring: (id: string) => `#/p/${encodeURIComponent(id)}/authoring`,
	/** A project's first screen for the role picked on this device (the chat for a developer). */
	home: (id: string) => {
		const tab = homeTab(readWorkRole());
		return tab === "chat"
			? `#/p/${encodeURIComponent(id)}`
			: `#/p/${encodeURIComponent(id)}/${tab}`;
	},
	draft: (id: string, name: string) =>
		`#/p/${encodeURIComponent(id)}/d/${encodeURIComponent(name)}`,
};

export function useRoute(): Route {
	const [route, setRoute] = useState(() => parseRoute(location.hash));
	useEffect(() => {
		const on = () => setRoute(parseRoute(location.hash));
		window.addEventListener("hashchange", on);
		return () => window.removeEventListener("hashchange", on);
	}, []);
	return route;
}
