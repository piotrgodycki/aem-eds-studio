import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon.js";
import { type Project, type Repo, type Status, api } from "./api.js";
import { href } from "./router.js";

export function Projects(props: { status: Status | null }) {
	const [projects, setProjects] = useState<Project[] | null>(null);
	const [adding, setAdding] = useState(false);
	const [error, setError] = useState("");

	const load = useCallback(
		() => api.projects().then(setProjects, (e: Error) => setError(e.message)),
		[],
	);
	useEffect(() => {
		void load();
	}, [load]);

	return (
		<main className="page">
			<div className="page-head">
				<div>
					<span className="eyebrow">Studio</span>
					<h1>Projects</h1>
					<p className="muted">
						Edge Delivery sites the studio works on: a GitHub repository or a folder on this
						machine.
					</p>
				</div>
				<button type="button" className="btn btn-accent" onClick={() => setAdding(true)}>
					<Icon name="plus" /> Add project
				</button>
			</div>
			{error && <p className="error">{error}</p>}
			{adding && (
				<AddProject
					status={props.status}
					onClose={() => setAdding(false)}
					onAdded={(p) => {
						setAdding(false);
						location.hash = href.project(p.id);
					}}
				/>
			)}
			{projects && projects.length === 0 && !adding && (
				<div className="empty">
					<p>No projects yet.</p>
					<p className="muted">
						Add one from GitHub or open a local folder to start turning designs into blocks.
					</p>
				</div>
			)}
			<div className="cards">
				{projects?.map((p) => (
					<a key={p.id} className="card" href={href.project(p.id)}>
						<span className="eyebrow">
							<Icon name={p.source.type === "github" ? "github" : "folder"} size={13} />{" "}
							{p.source.type === "github" ? "GitHub" : "Local folder"}
						</span>
						<strong>{p.name}</strong>
						<span className="muted mono small">{p.path}</span>
					</a>
				))}
			</div>
		</main>
	);
}

function AddProject(props: {
	status: Status | null;
	onClose: () => void;
	onAdded: (p: Project) => void;
}) {
	const github = props.status?.github.connected;
	const [tab, setTab] = useState<"github" | "local">(github === false ? "local" : "github");
	const [repos, setRepos] = useState<Repo[] | null>(null);
	const [filter, setFilter] = useState("");
	const [path, setPath] = useState("");
	const [busy, setBusy] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		if (tab === "github" && github && !repos)
			api.repos().then(setRepos, (e: Error) => setError(e.message));
	}, [tab, github, repos]);

	const shown = useMemo(
		() =>
			(repos ?? [])
				.filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase()))
				.slice(0, 50),
		[repos, filter],
	);

	const add = async (fn: () => Promise<Project>, label: string) => {
		setBusy(label);
		setError("");
		try {
			props.onAdded(await fn());
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy("");
		}
	};

	return (
		<section className="panel">
			<div className="tabs">
				<button
					type="button"
					className={tab === "github" ? "on" : ""}
					onClick={() => setTab("github")}
				>
					<Icon name="github" /> From GitHub
				</button>
				<button
					type="button"
					className={tab === "local" ? "on" : ""}
					onClick={() => setTab("local")}
				>
					<Icon name="folder" /> Local folder
				</button>
				<button type="button" className="btn btn-ghost close" onClick={props.onClose}>
					Cancel
				</button>
			</div>
			{tab === "github" &&
				(github ? (
					<>
						<input
							className="wide"
							placeholder="Filter your repositories…"
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
						/>
						{!repos && !error && <p className="muted">Loading repositories…</p>}
						<ul className="repo-list">
							{shown.map((r) => (
								<li key={r.fullName}>
									<div>
										<strong>{r.fullName}</strong>
										{r.private && <span className="tag">private</span>}
										{r.description && <div className="muted small">{r.description}</div>}
									</div>
									<button
										type="button"
										className="btn btn-outline"
										disabled={!!busy}
										onClick={() => add(() => api.addGithub(r.fullName), r.fullName)}
									>
										{busy === r.fullName ? "Cloning…" : "Add"}
									</button>
								</li>
							))}
						</ul>
					</>
				) : (
					<p className="muted">
						Not connected to GitHub. Start the studio with <code>GITHUB_TOKEN</code> set, or run{" "}
						<code>gh auth login</code>, then reload. The token stays on this machine.
					</p>
				))}
			{tab === "local" && (
				<form
					className="row"
					onSubmit={(e) => {
						e.preventDefault();
						void add(() => api.addLocal(path.trim()), "local");
					}}
				>
					<input
						className="wide mono"
						placeholder="/Users/you/projects/my-eds-site"
						value={path}
						onChange={(e) => setPath(e.target.value)}
					/>
					<button type="submit" className="btn btn-accent" disabled={!path.trim() || !!busy}>
						{busy ? "Opening…" : "Open"}
					</button>
				</form>
			)}
			{error && <p className="error">{error}</p>}
		</section>
	);
}
