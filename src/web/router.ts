import { useEffect, useState } from "react";

/** A project opens on its chat; Blocks holds the New block form, Drafts what waits for review. */
export type ProjectTab = "chat" | "blocks" | "drafts" | "board";

const TABS: ProjectTab[] = ["blocks", "drafts", "board"];

export type Route =
	| { page: "projects" }
	| { page: "project"; id: string; tab: ProjectTab; thread?: string }
	| { page: "draft"; id: string; name: string }
	| { page: "pair"; code: string };

export function parseRoute(hash: string): Route {
	const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
	if (parts[0] === "pair" && parts[1]) return { page: "pair", code: parts[1] };
	if (parts[0] === "p" && parts[1] && parts[2] === "d" && parts[3])
		return { page: "draft", id: parts[1], name: parts[3] };
	if (parts[0] === "p" && parts[1] && parts[2] === "t" && parts[3])
		return { page: "project", id: parts[1], tab: "chat", thread: parts[3] };
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
	blocks: (id: string) => `#/p/${encodeURIComponent(id)}/blocks`,
	drafts: (id: string) => `#/p/${encodeURIComponent(id)}/drafts`,
	board: (id: string) => `#/p/${encodeURIComponent(id)}/board`,
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
