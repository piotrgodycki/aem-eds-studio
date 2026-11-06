import { useEffect, useState } from "react";
import { DraftView } from "./DraftView.js";
import { ProjectView } from "./ProjectView.js";
import { Projects } from "./Projects.js";
import { type Status, api } from "./api.js";
import { href, useRoute } from "./router.js";

export function App() {
	const route = useRoute();
	const [status, setStatus] = useState<Status | null>(null);
	useEffect(() => {
		api.status().then(setStatus, () => setStatus(null));
	}, []);

	return (
		<>
			<header className="top">
				<a className="brand" href={href.projects()}>
					<span className="logo">&gt;_</span>
					<span>aem-eds-studio</span>
				</a>
				<div className="chips">
					{status && (
						<span
							className={`chip ${status.eds.ok ? "" : "bad"}`}
							title={status.eds.ok ? "The eds CLI the studio runs" : status.eds.error}
						>
							{status.eds.ok ? `eds ${status.eds.version}` : "eds missing"}
						</span>
					)}
					{status && (
						<span className={`chip ${status.github.connected ? "" : "dim"}`}>
							{status.github.connected ? `GitHub · ${status.github.login}` : "GitHub not connected"}
						</span>
					)}
				</div>
			</header>
			{status && !status.eds.ok && (
				<div className="banner">
					{status.eds.error} The studio runs the <code>eds</code> CLI for every step.
				</div>
			)}
			{route.page === "projects" && <Projects status={status} />}
			{route.page === "project" && <ProjectView key={route.id} id={route.id} />}
			{route.page === "draft" && (
				<DraftView key={`${route.id}/${route.name}`} id={route.id} name={route.name} />
			)}
		</>
	);
}
