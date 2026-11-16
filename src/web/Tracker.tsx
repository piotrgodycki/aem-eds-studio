import { useEffect, useState } from "react";
import { api, type Project, type TokenStatus, type Tracker } from "./api.js";

const NAMES = { github: "GitHub", jira: "Jira", ado: "Azure DevOps" } as const;

/** Where QA reports go: the project's tracker, else GitHub Issues. */
export const reportsTo = (project: Pick<Project, "tracker"> | null) =>
	NAMES[project?.tracker?.kind ?? "github"];

/**
 * The draft's ticket in the team's tracker, from its branch: feature/STUDIO-12 is
 * STUDIO-12 in Jira, or work item 12 in Azure DevOps.
 */
export function ticketLink(
	project: Pick<Project, "tracker" | "ticketKey"> | null,
	branch: string | undefined,
): { label: string; url: string } | null {
	const t = project?.tracker;
	const key = project?.ticketKey;
	const m = key && branch ? new RegExp(`^(?:feature|bug)/${key}-(\\d+)$`).exec(branch) : null;
	if (!t || !m) return null;
	return t.kind === "jira"
		? { label: `${key}-${m[1]}`, url: `${t.site}/browse/${key}-${m[1]}` }
		: {
				label: `Work item ${m[1]}`,
				url: `${t.org}/${encodeURIComponent(t.project)}/_workitems/edit/${m[1]}`,
			};
}

/** The project's settings, for what depends on its tracker. */
export function useProject(id: string): Project | null {
	const [project, setProject] = useState<Project | null>(null);
	useEffect(() => {
		api.project(id).then(setProject, () => setProject(null));
	}, [id]);
	return project;
}

type Kind = "github" | Tracker["kind"];

/** Project settings: Jira or Azure DevOps for QA reports and ticket links, with its token. */
export function TrackerSetting(props: { project: Project; onSaved: (p: Project) => void }) {
	const t = props.project.tracker;
	const [kind, setKind] = useState<Kind>(t?.kind ?? "github");
	const [site, setSite] = useState(t?.kind === "jira" ? t.site : "");
	const [email, setEmail] = useState(t?.kind === "jira" ? t.email : "");
	const [org, setOrg] = useState(t?.kind === "ado" ? t.org : "");
	const [adoProject, setAdoProject] = useState(t?.kind === "ado" ? t.project : "");
	const [token, setToken] = useState("");
	const [status, setStatus] = useState<TokenStatus | null>(null);
	const [note, setNote] = useState("");
	const [error, setError] = useState("");
	useEffect(() => {
		api.trackerToken(props.project.id).then(setStatus, () => setStatus(null));
	}, [props.project.id]);

	const save = async () => {
		setError("");
		setNote("");
		try {
			const tracker: Tracker | null =
				kind === "jira"
					? { kind, site, email }
					: kind === "ado"
						? { kind, org, project: adoProject }
						: null;
			props.onSaved(await api.setTracker(props.project.id, tracker));
			if (tracker && token) {
				setStatus(await api.saveTrackerToken(props.project.id, token));
				setToken("");
			}
			setNote("Saved.");
		} catch (e) {
			setError((e as Error).message);
		}
	};

	return (
		<section className="settings-section">
			<h3>Tracker</h3>
			<p className="muted small">
				Where QA reports from review go, and where a draft's ticket links to. Jira uses the ticket
				key above as its project.
			</p>
			<form
				className="tracker-setting"
				onSubmit={(e) => {
					e.preventDefault();
					void save();
				}}
			>
				<fieldset className="seg">
					<legend className="sr-only">Tracker</legend>
					{(["github", "jira", "ado"] as const).map((k) => (
						<button
							key={k}
							type="button"
							className={kind === k ? "on" : ""}
							aria-pressed={kind === k}
							onClick={() => setKind(k)}
						>
							{k === "github" ? "GitHub Issues" : NAMES[k]}
						</button>
					))}
				</fieldset>
				{kind === "jira" && (
					<>
						<input
							className="mono"
							aria-label="Jira site"
							placeholder="https://acme.atlassian.net"
							value={site}
							onChange={(e) => setSite(e.target.value.trim())}
						/>
						<input
							aria-label="Email of the token's account"
							placeholder="Email of the token's account"
							value={email}
							onChange={(e) => setEmail(e.target.value.trim())}
						/>
					</>
				)}
				{kind === "ado" && (
					<>
						<input
							className="mono"
							aria-label="Azure DevOps organization"
							placeholder="https://dev.azure.com/acme"
							value={org}
							onChange={(e) => setOrg(e.target.value.trim())}
						/>
						<input
							aria-label="Azure DevOps project"
							placeholder="Project"
							value={adoProject}
							onChange={(e) => setAdoProject(e.target.value)}
						/>
					</>
				)}
				{kind !== "github" && status?.canSave && (
					<input
						type="password"
						autoComplete="off"
						aria-label="API token"
						placeholder={
							status.saved
								? "Token saved in the keychain. Paste a new one to replace it"
								: kind === "jira"
									? "API token (id.atlassian.com, Security)"
									: "Personal access token with Work Items read and write"
						}
						value={token}
						onChange={(e) => setToken(e.target.value.trim())}
					/>
				)}
				<div className="row">
					<button type="submit" className="btn btn-outline btn-sm">
						Save
					</button>
					{kind !== "github" && status && !status.canSave && (
						<span className="muted small">
							{status.env ? "Using EDS_TRACKER_TOKEN." : "Set EDS_TRACKER_TOKEN for the token."}
						</span>
					)}
				</div>
			</form>
			{note && !error && <p className="muted small">{note}</p>}
			{error && <p className="error small">{error}</p>}
		</section>
	);
}
