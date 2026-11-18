import { useCallback, useEffect, useState } from "react";
import { api, type Found, type Inventory, type Project, type ProjectMetrics } from "./api.js";
import { BlockAnalytics } from "./BlockAnalytics.js";
import { useContent } from "./ContentLink.js";
import { EventsCard } from "./Events.js";
import { Icon } from "./Icon.js";
import { PageMetaCard } from "./PageMeta.js";

/**
 * The Overview tab: what the project already has, from `eds inspect`, in
 * groups of folding cards (Code, Integrations, Analytics). Each card shows its
 * count and a one-line summary when folded; each finding opens to its files.
 */
export function Overview(props: { project: Project }) {
	const projectId = props.project.id;
	const [inv, setInv] = useState<Inventory | null>(null);
	const [tracking, setTracking] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const read = useCallback(async () => {
		setBusy(true);
		setError("");
		try {
			setInv(await api.inventory(projectId));
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}, [projectId]);
	useEffect(() => {
		void read();
	}, [read]);

	if (!inv) return <p className="muted">{error || "Reading the project…"}</p>;
	const a = inv.analytics;
	const names = (list: Array<{ name: string }>) => list.map((f) => f.name).join(", ");
	return (
		<div className="overview">
			<div className="overview-head">
				<div className="overview-facts">
					<Fact
						label="Kind"
						value={inv.kind === "universal-editor" ? "Universal Editor" : "Document-based"}
					/>
					<Fact
						label="Content"
						value={inv.content?.source ?? "No fstab.yaml"}
						title={inv.content?.url}
					/>
					<Fact label="Blocks" value={String(inv.blocks.length)} />
					{inv.kind === "universal-editor" && (
						<Fact
							label="UE"
							value={`${inv.components.definitions} components · ${inv.components.models} models`}
						/>
					)}
					<Fact
						label="Styles"
						value={`${inv.styles.tokens} tokens${inv.styles.fonts.length ? ` · ${inv.styles.fonts.join(", ")}` : ""}`}
					/>
				</div>
				<button
					type="button"
					className="btn btn-ghost btn-sm"
					disabled={busy}
					onClick={() => void read()}
				>
					<Icon name="history" size={14} /> {busy ? "Reading…" : "Refresh"}
				</button>
			</div>
			{error && <p className="error small">{error}</p>}
			<ProjectReport projectId={projectId} />

			<Group title="Code" />
			<Section title="Blocks" count={inv.blocks.length} summary={names(inv.blocks)}>
				<ul className="overview-blocks">
					{inv.blocks.map((b) => (
						<li key={b.name}>
							<code>{b.name}</code>
							<span className="muted small">
								{[b.js && "JS", b.css && "CSS", b.model && "UE model", b.preview && "preview"]
									.filter(Boolean)
									.join(" · ")}
							</span>
							{b.js && (
								<button
									type="button"
									className="btn btn-ghost btn-sm push-right"
									onClick={() => setTracking(b.name)}
								>
									<Icon name="usage" size={13} /> Analytics
								</button>
							)}
						</li>
					))}
				</ul>
			</Section>
			{(inv.thirdParties.length > 0 || a.ids.length > 0 || a.gtmSheet) && (
				<Group title="Integrations" />
			)}
			{a.gtmSheet && <GtmSheetLine project={props.project} sheet={a.gtmSheet} />}
			<Findings title="Third parties" list={inv.thirdParties} />
			<Findings title="Tag IDs" list={a.ids} />
			<Group title="Analytics" />
			<PageMetaCard project={props.project} />
			<EventsCard project={props.project} />
			<Findings title="Data layer" list={a.dataLayer} />
			<Findings title="Custom events" list={a.events} />
			<Findings title="Page metadata read" list={a.metadata} />
			<Findings title="RUM checkpoints" list={a.rum} />
			{tracking && (
				<BlockAnalytics
					project={props.project}
					block={tracking}
					onClose={() => setTracking(null)}
				/>
			)}
		</div>
	);
}

function Fact(props: { label: string; value: string; title?: string }) {
	return (
		<div className="overview-fact" title={props.title}>
			<span className="muted small">{props.label}</span>
			<strong>{props.value}</strong>
		</div>
	);
}

function Group(props: { title: string }) {
	return <h3 className="overview-group">{props.title}</h3>;
}

/** Cards open at first; what you open or close afterwards is remembered on this computer. */
const OPEN_AT_FIRST = ["Blocks", "Data layer"];
const OPEN_KEY = "studio.overview.open";

function openCards(): string[] {
	try {
		const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "null");
		return Array.isArray(saved) ? saved : OPEN_AT_FIRST;
	} catch {
		return OPEN_AT_FIRST;
	}
}

function remember(title: string, open: boolean) {
	const now = new Set(openCards());
	if (open) now.add(title);
	else now.delete(title);
	try {
		localStorage.setItem(OPEN_KEY, JSON.stringify([...now]));
	} catch {
		// Private mode or no storage: the cards just start as they do the first time.
	}
}

function Section(props: {
	title: string;
	count: number;
	summary: string;
	children: React.ReactNode;
}) {
	return (
		<details
			className="overview-card"
			open={openCards().includes(props.title)}
			onToggle={(e) => remember(props.title, e.currentTarget.open)}
		>
			<summary>
				<Icon name="chevron" size={14} />
				<strong>{props.title}</strong>
				<span className="overview-count">{props.count}</span>
				<span className="muted small overview-summary">{props.summary}</span>
			</summary>
			{props.children}
		</details>
	);
}

/** A list of findings; each one opens to the files it was found in. */
function Findings(props: { title: string; list: Found[] }) {
	if (!props.list.length) return null;
	return (
		<Section
			title={props.title}
			count={props.list.length}
			summary={props.list.map((f) => f.name).join(", ")}
		>
			<ul className="overview-findings">
				{props.list.map((f) => (
					<li key={f.name}>
						<details>
							<summary>
								{f.name}
								<span className="muted small">
									{f.files.length === 1 ? f.files[0] : `${f.files.length} files`}
								</span>
							</summary>
							{f.files.length > 1 && (
								<ul className="overview-files mono small">
									{f.files.map((file) => (
										<li key={file}>{file}</li>
									))}
								</ul>
							)}
						</details>
					</li>
				))}
			</ul>
		</Section>
	);
}

/** What the studio saved this project in the last 30 days: the numbers for whoever pays for it. */
function ProjectReport(props: { projectId: string }) {
	const [m, setM] = useState<ProjectMetrics | null>(null);
	useEffect(() => {
		api.metrics(props.projectId, 30).then(setM, () => setM(null));
	}, [props.projectId]);
	if (!m || (!m.drafts.accepted && !m.agents.runs)) return null;
	const d = m.drafts;
	const items = [
		`${d.accepted} ${d.accepted === 1 ? "block" : "blocks"} accepted`,
		d.accepted ? `${d.firstTry} at the first version` : "",
		d.rounds !== null ? `${d.rounds.toFixed(1)} versions each` : "",
		d.hoursToAccept !== null ? `${duration(d.hoursToAccept)} from first version to accepted` : "",
		`${m.agents.minutes} min of agent work`,
		m.agents.costUsd !== null ? `$${m.agents.costUsd.toFixed(2)}` : "",
	].filter(Boolean);
	return (
		<p className="overview-report small">
			<strong>Last 30 days</strong> <span className="muted">{items.join(" · ")}</span>
		</p>
	);
}

function duration(hours: number): string {
	if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
	return hours < 48 ? `${hours.toFixed(1)} h` : `${Math.round(hours / 24)} days`;
}

/** Where GTM's container ID comes from: the content sheet, its value on the live site, and where to edit it. */
function GtmSheetLine(props: { project: Project; sheet: string }) {
	const content = useContent(props.project);
	const [gtm, setGtm] = useState<{ url: string | null; id: string | null; error?: string } | null>(
		null,
	);
	useEffect(() => {
		api
			.gtm(props.project.id, props.sheet)
			.then(setGtm, (e: Error) => setGtm({ url: null, id: null, error: e.message }));
	}, [props.project.id, props.sheet]);
	const link = content?.link;
	// DA opens sheets at /sheet#/ where documents are at /edit#/.
	const daSheet =
		link?.source === "da"
			? link.url.replace("/edit#/", "/sheet#/").replace(/\/$/, "") + props.sheet
			: null;
	return (
		<p className="overview-gtm small">
			<strong>GTM</strong>{" "}
			{gtm?.id ? (
				<span className="mono">{gtm.id}</span>
			) : (
				<span className="muted">container ID</span>
			)}{" "}
			<span className="muted">from the sheet</span>{" "}
			{gtm?.url ? (
				<a className="mono" href={gtm.url} target="_blank" rel="noreferrer">
					{props.sheet}
				</a>
			) : (
				<span className="mono">{props.sheet}</span>
			)}
			{daSheet ? (
				<a
					className="btn btn-ghost btn-sm push-right"
					href={daSheet}
					target="_blank"
					rel="noreferrer"
				>
					Edit in DA ↗
				</a>
			) : (
				link?.source === "ue" && <span className="muted push-right">An AEM Sites spreadsheet</span>
			)}
			{gtm?.error && <span className="warn-text overview-gtm-note">{gtm.error}</span>}
		</p>
	);
}
