import { useCallback, useEffect, useState } from "react";
import { DraftView } from "./DraftView.js";
import { GitHubPill } from "./GitHubConnect.js";
import { Icon, Lockup } from "./Icon.js";
import { JobsPill } from "./JobsPill.js";
import { ProjectView } from "./ProjectView.js";
import { Projects } from "./Projects.js";
import { SetupDialog, openIssues } from "./SetupDialog.js";
import { Tutorial } from "./Tutorial.js";
import { UpdatePill } from "./UpdatePill.js";
import { type Project, type SetupCheck, type Status, api } from "./api.js";
import { type Route, href, useRoute } from "./router.js";

export function App() {
	const route = useRoute();
	const [status, setStatus] = useState<Status | null>(null);
	const [projects, setProjects] = useState<Project[]>([]);
	const [tour, setTour] = useState(false);
	const [collapsed, setCollapsed] = useState(false);
	const [drawer, setDrawer] = useState(false);
	const [setup, setSetup] = useState(false);
	const [setupIssues, setSetupIssues] = useState(0);
	const review = route.page === "draft";

	useEffect(() => {
		api.status().then(setStatus, () => setStatus(null));
		Promise.all([api.settings(), api.setup().catch(() => [])]).then(
			([s, checks]) => {
				// The first launch opens the tutorial; finishing or skipping it is remembered.
				// Otherwise a missing requirement opens the Setup window by itself.
				const issues = openIssues(checks).length;
				setSetupIssues(issues);
				if (!s.tutorialDone) setTour(true);
				else if (issues) setSetup(true);
				setCollapsed(!!s.sidebarCollapsed);
			},
			() => {},
		);
	}, []);
	// The side menu's project list follows the page (a project added, removed or renamed).
	// biome-ignore lint/correctness/useExhaustiveDependencies: reload on every navigation
	useEffect(() => {
		api.projects().then(setProjects, () => {});
		setDrawer(false);
	}, [route]);

	const closeTour = useCallback(() => {
		setTour(false);
		void api.updateSettings({ tutorialDone: true });
	}, []);
	const toggle = () => {
		const next = !collapsed;
		setCollapsed(next);
		void api.updateSettings({ sidebarCollapsed: next });
	};
	const onChecked = useCallback((checks: SetupCheck[]) => {
		setSetupIssues(openIssues(checks).length);
		api.status().then(setStatus, () => {});
	}, []);
	const closeSetup = useCallback(() => setSetup(false), []);
	const setGithub = (github: Status["github"]) => setStatus((s) => s && { ...s, github });

	return (
		<div
			className={`app shell${collapsed ? " shell-collapsed" : ""}${review ? " app-review" : ""}${drawer ? " drawer-open" : ""}`}
		>
			<header className="mobile-bar">
				<Lockup href={href.projects()} />
				<button
					type="button"
					className="btn btn-ghost btn-icon"
					aria-label="Menu"
					aria-expanded={drawer}
					onClick={() => setDrawer((d) => !d)}
				>
					<Icon name="menu" />
				</button>
			</header>
			<button
				type="button"
				className="drawer-scrim"
				aria-label="Close menu"
				tabIndex={-1}
				onClick={() => setDrawer(false)}
			/>

			<aside className="sidebar" aria-label="Studio">
				<div className="side-top">
					<Lockup href={href.projects()} />
					<button
						type="button"
						className="btn btn-ghost btn-icon side-toggle"
						aria-label={collapsed ? "Expand the menu" : "Collapse the menu"}
						title={collapsed ? "Expand the menu" : "Collapse the menu"}
						onClick={toggle}
					>
						<Icon name={collapsed ? "panelClose" : "panelOpen"} />
					</button>
				</div>

				<nav className="side-nav" aria-label="Main">
					<SideLink
						href={href.projects()}
						icon="folder"
						label="All projects"
						on={route.page === "projects"}
					/>
					{projects.length > 0 && <div className="side-label">Projects</div>}
					{projects.map((p) => (
						<ProjectLinks key={p.id} project={p} route={route} />
					))}
				</nav>

				<div className="side-foot">
					<button
						type="button"
						className="side-link"
						title="The tutorial: agents, projects, your first block"
						onClick={() => setTour(true)}
					>
						<Icon name="help" />
						<span className="side-text">Guide</span>
					</button>
					<button
						type="button"
						className="side-link"
						title="What the studio needs and how to fix it"
						onClick={() => setSetup(true)}
					>
						<Icon name="setup" />
						<span className="side-text">Setup</span>
						{setupIssues > 0 && <span className="side-count bad">{setupIssues}</span>}
					</button>
					<div className="side-pills">
						<UpdatePill />
						<JobsPill />
						{status && (
							<span
								className={`pill ${status.eds.ok ? "" : "pill-bad"}`}
								title={
									status.eds.ok
										? "The aem-eds-kit engine (the eds CLI) the studio runs"
										: status.eds.error
								}
							>
								<span className={`dot ${status.eds.ok ? "dot-done" : "dot-failed"}`} />
								<span className="side-text">
									{status.eds.ok ? `aem-eds-kit ${status.eds.version}` : "aem-eds-kit missing"}
								</span>
							</span>
						)}
						{status && <GitHubPill github={status.github} onChange={setGithub} />}
					</div>
				</div>
			</aside>

			<div className="main">
				{status && !status.eds.ok && (
					<div className="banner">
						{status.eds.error} The studio runs the <code>eds</code> CLI for every step.
					</div>
				)}
				{tour && <Tutorial onClose={closeTour} />}
				{setup && <SetupDialog onClose={closeSetup} onChecked={onChecked} />}
				{route.page === "projects" && <Projects status={status} onGithub={setGithub} />}
				{route.page === "project" && <ProjectView key={route.id} id={route.id} tab={route.tab} />}
				{route.page === "draft" && (
					<DraftView key={`${route.id}/${route.name}`} id={route.id} name={route.name} />
				)}
			</div>
		</div>
	);
}

function SideLink(props: {
	href: string;
	icon: Parameters<typeof Icon>[0]["name"];
	label: string;
	on: boolean;
	sub?: boolean;
	/** Shown instead of the icon when the menu is folded (a project's initial). */
	initial?: string;
}) {
	return (
		<a
			href={props.href}
			className={`side-link${props.on ? " on" : ""}${props.sub ? " side-sub" : ""}`}
			aria-current={props.on ? "page" : undefined}
			title={props.label}
		>
			<Icon name={props.icon} className={props.initial ? "side-icon" : undefined} />
			{props.initial && (
				<span className="side-initial" aria-hidden="true">
					{props.initial}
				</span>
			)}
			<span className="side-text">{props.label}</span>
		</a>
	);
}

/** A project in the side menu; the open one shows its blocks, work board and the draft under review. */
function ProjectLinks(props: { project: Project; route: Route }) {
	const { project: p, route } = props;
	const here = route.page !== "projects" && route.id === p.id;
	return (
		<div className={`side-project${here ? " here" : ""}`}>
			<SideLink
				href={href.project(p.id)}
				icon={p.source.type === "github" ? "github" : "folder"}
				label={p.name}
				initial={p.name.slice(0, 1).toUpperCase()}
				on={false}
			/>
			{here && (
				<>
					<SideLink
						href={href.project(p.id)}
						icon="design"
						label="Blocks"
						on={route.page === "project" && route.tab === "blocks"}
						sub
					/>
					<SideLink
						href={href.board(p.id)}
						icon="github"
						label="Work board"
						on={route.page === "project" && route.tab === "board"}
						sub
					/>
					{route.page === "draft" && (
						<SideLink
							href={href.draft(p.id, route.name)}
							icon="desktop"
							label={`Review: ${route.name}`}
							on
							sub
						/>
					)}
				</>
			)}
		</div>
	);
}
