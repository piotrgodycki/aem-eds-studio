import { useCallback, useEffect, useMemo, useState } from "react";
import { api, desktop, type Project, type Repo, type Status } from "./api.js";
import { ConnectGitHubButton } from "./GitHubConnect.js";
import { Icon } from "./Icon.js";
import { href } from "./router.js";
import { ADD_PROJECT_EVENT } from "./Tutorial.js";

export function Projects(props: {
	status: Status | null;
	onGithub: (g: Status["github"]) => void;
}) {
	const [projects, setProjects] = useState<Project[] | null>(null);
	const [adding, setAdding] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	const load = useCallback(
		() => api.projects().then(setProjects, (e: Error) => setError(e.message)),
		[],
	);
	useEffect(() => {
		void load();
	}, [load]);
	useEffect(() => {
		const open = () => setAdding(true);
		window.addEventListener(ADD_PROJECT_EVENT, open);
		return () => window.removeEventListener(ADD_PROJECT_EVENT, open);
	}, []);

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
				<div className="row">
					<label
						className="btn btn-outline"
						title="Import a project from a .studio.json settings file"
					>
						Import project
						<input
							type="file"
							accept="application/json,.json"
							className="sr-only"
							onChange={async (e) => {
								const file = e.target.files?.[0];
								e.target.value = "";
								if (!file) return;
								setError("");
								try {
									const { project, created } = await api.importSettings(
										JSON.parse(await file.text()),
									);
									setNotice(
										created
											? `Imported ${project.name}.`
											: `Updated ${project.name} from the file.`,
									);
									void load();
								} catch (err) {
									setError((err as Error).message);
								}
							}}
						/>
					</label>
					<button type="button" className="btn btn-accent" onClick={() => setAdding(true)}>
						<Icon name="plus" /> Add project
					</button>
				</div>
			</div>
			{error && <p className="error">{error}</p>}
			{notice && <p className="ok-text">{notice}</p>}
			{adding && (
				<AddProject
					status={props.status}
					onGithub={props.onGithub}
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
	onGithub: (g: Status["github"]) => void;
	onClose: () => void;
	onAdded: (p: Project) => void;
}) {
	const github = props.status?.github.connected;
	const [tab, setTab] = useState<"github" | "local">(
		github === false && !props.status?.github.canSignIn ? "local" : "github",
	);
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
					<div className="connect-gh">
						{props.status?.github.canSignIn ? (
							<>
								<p className="muted">
									Connect your GitHub account to pick a repository. The token stays on this
									computer, in the system keychain.
								</p>
								<ConnectGitHubButton onConnected={props.onGithub} />
							</>
						) : (
							<p className="muted">
								Not connected to GitHub. Paste a token in Settings, or in the browser start the
								studio with <code>GITHUB_TOKEN</code> set. The token stays on this machine.
							</p>
						)}
					</div>
				))}
			{tab === "local" && (
				<div className="local-pick">
					{desktop && (
						<>
							<button
								type="button"
								className="btn btn-accent"
								disabled={!!busy}
								onClick={async () => {
									const dir = await desktop?.pickFolder();
									if (dir) void add(() => api.addLocal(dir), "local");
								}}
							>
								<Icon name="folder" /> {busy ? "Opening…" : "Choose folder…"}
							</button>
							<p className="muted small">
								An Edge Delivery project: the folder with <code>fstab.yaml</code> or{" "}
								<code>blocks/</code>.
							</p>
						</>
					)}
					<details open={!desktop}>
						<summary className={desktop ? "muted small" : "sr-only"}>Or paste a path</summary>
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
								aria-label="Project folder path"
								value={path}
								onChange={(e) => setPath(e.target.value)}
							/>
							<button
								type="submit"
								className={desktop ? "btn btn-outline" : "btn btn-accent"}
								disabled={!path.trim() || !!busy}
							>
								{busy ? "Opening…" : "Open"}
							</button>
						</form>
					</details>
				</div>
			)}
			{error && <p className="error">{error}</p>}
		</section>
	);
}
