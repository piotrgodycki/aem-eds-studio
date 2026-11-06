import { useEffect, useState } from "react";

export type Route =
	| { page: "projects" }
	| { page: "project"; id: string }
	| { page: "draft"; id: string; name: string };

export function parseRoute(hash: string): Route {
	const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
	if (parts[0] === "p" && parts[1] && parts[2] === "d" && parts[3])
		return { page: "draft", id: parts[1], name: parts[3] };
	if (parts[0] === "p" && parts[1]) return { page: "project", id: parts[1] };
	return { page: "projects" };
}

export const href = {
	projects: () => "#/",
	project: (id: string) => `#/p/${encodeURIComponent(id)}`,
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
