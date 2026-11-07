import { useEffect, useState } from "react";
import { DraftView } from "./DraftView.js";
import { GitHubPill } from "./GitHubConnect.js";
import { Icon, Lockup } from "./Icon.js";
import { JobsPill } from "./JobsPill.js";
import { ProjectView } from "./ProjectView.js";
import { Projects } from "./Projects.js";
import { UpdatePill } from "./UpdatePill.js";
import { type Status, api } from "./api.js";
import { href, useRoute } from "./router.js";

export function App() {
	const route = useRoute();
	const [status, setStatus] = useState<Status | null>(null);
	useEffect(() => {
		api.status().then(setStatus, () => setStatus(null));
	}, []);

	return (
		<div className={`app ${route.page === "draft" ? "app-review" : ""}`}>
			<header className="nav">
				<Lockup href={href.projects()} />
				<nav className="nav-links" aria-label="Main">
					<a href={href.projects()} className={route.page === "projects" ? "on" : ""}>
						Projects
					</a>
				</nav>
				<div className="nav-actions">
					<UpdatePill />
					<JobsPill />
					{status && (
						<span
							className={`pill ${status.eds.ok ? "" : "pill-bad"}`}
							title={status.eds.ok ? "The eds CLI the studio runs" : status.eds.error}
						>
							<span className={`dot ${status.eds.ok ? "dot-done" : "dot-failed"}`} />
							{status.eds.ok ? `eds ${status.eds.version}` : "eds missing"}
						</span>
					)}
					{status && (
						<GitHubPill
							github={status.github}
							onChange={(github) => setStatus((s) => s && { ...s, github })}
						/>
					)}
				</div>
			</header>
			{status && !status.eds.ok && (
				<div className="banner">
					{status.eds.error} The studio runs the <code>eds</code> CLI for every step.
				</div>
			)}
			{route.page === "projects" && (
				<Projects status={status} onGithub={(github) => setStatus((s) => s && { ...s, github })} />
			)}
			{route.page === "project" && <ProjectView key={route.id} id={route.id} />}
			{route.page === "draft" && (
				<DraftView key={`${route.id}/${route.name}`} id={route.id} name={route.name} />
			)}
		</div>
	);
}
