import { useCallback, useEffect, useState } from "react";
import { api, type Device, type Project, type SetupCheck, type Status, UNPAIRED } from "./api.js";
import { DraftView } from "./DraftView.js";
import { GitHubPill } from "./GitHubConnect.js";
import { HistoryDialog } from "./HistoryDialog.js";
import { Icon, Lockup } from "./Icon.js";
import { JobsPill } from "./JobsPill.js";
import { PairedDevice, PairScreen, Unpaired } from "./Pairing.js";
import { Projects } from "./Projects.js";
import { ProjectView } from "./ProjectView.js";
import { PullsPanel } from "./PullsPanel.js";
import { href, type Route, useRoute } from "./router.js";
import { SettingsDialog, type SettingsTab } from "./SettingsDialog.js";
import { openIssues } from "./SetupPanel.js";
import { ThreadLinks } from "./ThreadLinks.js";
import { Tutorial } from "./Tutorial.js";
import { UpdatePill } from "./UpdatePill.js";
import { UsageDialog } from "./UsageDialog.js";

export function App() {
	const route = useRoute();
	const [status, setStatus] = useState<Status | null>(null);
	const [projects, setProjects] = useState<Project[]>([]);
	const [tour, setTour] = useState(false);
	const [collapsed, setCollapsed] = useState(false);
	const [drawer, setDrawer] = useState(false);
	const [setupIssues, setSetupIssues] = useState(0);
	const [settingsOpen, setSettingsOpen] = useState<SettingsTab | null>(null);
	const [historyOpen, setHistoryOpen] = useState(false);
	const [usageOpen, setUsageOpen] = useState(false);
	// Set on a phone or another computer paired over the network; null on the computer itself.
	const [device, setDevice] = useState<Device | null>(null);
	const [unpaired, setUnpaired] = useState(false);
	const review = route.page === "draft";

	useEffect(() => {
		const onUnpaired = () => setUnpaired(true);
		window.addEventListener(UNPAIRED, onUnpaired);
		return () => window.removeEventListener(UNPAIRED, onUnpaired);
	}, []);
	// The pairing page loads nothing else: the device has no access yet.
	const pairing = route.page === "pair";
	useEffect(() => {
		if (pairing) return;
		api.status().then(setStatus, () => setStatus(null));
		Promise.all([
			api.settings(),
			api.setup().catch(() => []),
			api.device().then((d) => d.device),
		]).then(
			([s, checks, paired]) => {
				setDevice(paired);
				// The first launch opens the tutorial; finishing or skipping it is remembered.
				// Otherwise a missing requirement opens Settings on its Setup tab (on the computer).
				const issues = openIssues(checks).length;
				setSetupIssues(issues);
				if (!s.tutorialDone) setTour(true);
				else if (issues && !paired) setSettingsOpen("setup");
				setCollapsed(!!s.sidebarCollapsed);
			},
			() => {},
		);
	}, [pairing]);
	// The side menu's project list follows the page (a project added, removed or renamed).
	// biome-ignore lint/correctness/useExhaustiveDependencies: reload on every navigation
	useEffect(() => {
		api.projects().then(setProjects, () => {});
		setDrawer(false);
	}, [route]);

	// Settings live on the computer: a paired device keeps these changes to itself.
	const closeTour = useCallback(() => {
		setTour(false);
		if (!device) void api.updateSettings({ tutorialDone: true });
	}, [device]);
	const toggle = () => {
		const next = !collapsed;
		setCollapsed(next);
		if (!device) void api.updateSettings({ sidebarCollapsed: next });
	};
	const onChecked = useCallback((checks: SetupCheck[]) => {
		setSetupIssues(openIssues(checks).length);
		api.status().then(setStatus, () => {});
	}, []);
	const setGithub = (github: Status["github"]) => setStatus((s) => s && { ...s, github });

	if (route.page === "pair") return <PairScreen code={route.code} />;
	if (unpaired) return <Unpaired />;

	return (
		<PairedDevice.Provider value={device}>
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
						{"id" in route && !collapsed && <PullsPanel projectId={route.id} />}
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
						<div className="side-corner">
							<button
								type="button"
								className="btn btn-ghost btn-icon"
								aria-label="Settings"
								title={setupIssues ? `Settings: ${setupIssues} thing(s) to set up` : "Settings"}
								onClick={() => setSettingsOpen(setupIssues ? "setup" : "settings")}
							>
								<Icon name="settings" size={18} />
								{setupIssues > 0 && <span className="corner-badge" aria-hidden="true" />}
							</button>
							<button
								type="button"
								className="btn btn-ghost btn-icon"
								aria-label="Project history"
								title="Project history (git)"
								onClick={() => setHistoryOpen(true)}
							>
								<Icon name="branch" size={18} />
							</button>
							<button
								type="button"
								className="btn btn-ghost btn-icon"
								aria-label="Usage"
								title="Usage: plan limits and tokens"
								onClick={() => setUsageOpen(true)}
							>
								<Icon name="usage" size={18} />
							</button>
							<button
								type="button"
								className="btn btn-ghost btn-icon"
								aria-label="Guide"
								title="Guide: a short tour of the studio"
								onClick={() => setTour(true)}
							>
								<Icon name="help" size={18} />
							</button>
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
					{settingsOpen && (
						<SettingsDialog
							device={device}
							status={status}
							tab={settingsOpen}
							setupIssues={setupIssues}
							onGithub={setGithub}
							onChecked={onChecked}
							onClose={() => setSettingsOpen(null)}
						/>
					)}
					{usageOpen && <UsageDialog onClose={() => setUsageOpen(false)} />}
					{historyOpen && (
						<HistoryDialog
							project={projects.find((p) => "id" in route && p.id === route.id)}
							onClose={() => setHistoryOpen(false)}
						/>
					)}
					{route.page === "projects" && <Projects status={status} onGithub={setGithub} />}
					{route.page === "project" && (
						<ProjectView
							key={route.id}
							id={route.id}
							tab={route.tab}
							thread={route.thread}
							job={route.job}
						/>
					)}
					{route.page === "draft" && (
						<DraftView key={`${route.id}/${route.name}`} id={route.id} name={route.name} />
					)}
				</div>
			</div>
		</PairedDevice.Provider>
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

/** A project in the side menu; the open one shows its chat threads and the draft under review. Blocks and the work board are tabs on the project page. */
function ProjectLinks(props: { project: Project; route: Route }) {
	const { project: p, route } = props;
	const here = "id" in route && route.id === p.id;
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
						icon="chat"
						label="Chat"
						on={route.page === "project" && route.tab === "chat" && !route.thread}
						sub
					/>
					<ThreadLinks
						projectId={p.id}
						current={route.page === "project" ? route.thread : undefined}
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
