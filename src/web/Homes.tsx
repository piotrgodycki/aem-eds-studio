import { useEffect, useState } from "react";
import {
	api,
	type Draft,
	type Inventory,
	type PageMetaProperty,
	type Project,
	type ProjectMetrics,
	type RumResult,
} from "./api.js";
import { Icon } from "./Icon.js";
import { PageCheck } from "./PageMeta.js";
import { href } from "./router.js";

/**
 * The starting screens of three roles (workRole.ts), each the same studio
 * arranged for one job: the Manager's report, QA's list to check, and the
 * Content author's blocks. A developer starts on the chat.
 */

/** A draft's ticket, from its branch (feature/STUDIO-12), or null. */
const ticketOf = (d: Draft) =>
	/^(?:feature|bug)\/([A-Z][A-Z0-9]+-\d+)$/.exec(d.branch ?? "")?.[1] ?? null;

/** How long ago, in hours or days. */
function since(iso: string | undefined, now = Date.now()): string {
	if (!iso) return "";
	const h = (now - new Date(iso).getTime()) / 3_600_000;
	return h < 48 ? `${Math.max(1, Math.round(h))} h` : `${Math.round(h / 24)} days`;
}

/** The site's mobile Core Web Vitals over 30 days, when the project has RUM set up; null otherwise. */
function useRum(project: Project): RumResult | null {
	const [rum, setRum] = useState<RumResult | null>(null);
	useEffect(() => {
		if (!project.rumDomain) return;
		api.rum(project.id, 30, "mobile").then(setRum, () => setRum(null));
	}, [project.id, project.rumDomain]);
	return rum;
}

const ms = (v: number | null) =>
	v === null ? "–" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
/** good, needs work or poor, by the Core Web Vitals thresholds. */
function rating(metric: "lcp" | "inp" | "cls", v: number | null): string {
	if (v === null) return "muted";
	const [good, poor] = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] }[metric];
	return v <= good ? "good" : v <= poor ? "ni" : "poor";
}

function Health(props: { project: Project; rum: RumResult | null }) {
	if (!props.project.rumDomain)
		return (
			<p className="muted small">
				No RUM yet: set the domain and key in{" "}
				<a href={href.performance(props.project.id)}>Performance</a>.
			</p>
		);
	if (!props.rum) return <p className="muted small">Reading the RUM data…</p>;
	const { lcp, inp, cls } = props.rum;
	return (
		<ul className="home-rows">
			<li>
				LCP <span className={`push-right ${rating("lcp", lcp.p75)}`}>{ms(lcp.p75)}</span>
			</li>
			<li>
				INP <span className={`push-right ${rating("inp", inp.p75)}`}>{ms(inp.p75)}</span>
			</li>
			<li>
				CLS{" "}
				<span className={`push-right ${rating("cls", cls.p75)}`}>
					{cls.p75 === null ? "–" : cls.p75.toFixed(2)}
				</span>
			</li>
		</ul>
	);
}

/** The Manager's report: what the studio saved, what waits on someone, and the site's health. */
export function ManagerHome(props: { project: Project; drafts: Draft[] | null }) {
	const { project } = props;
	const [m, setM] = useState<ProjectMetrics | null>(null);
	const [copied, setCopied] = useState(false);
	const rum = useRum(project);
	useEffect(() => {
		api.metrics(project.id, 30).then(setM, () => setM(null));
	}, [project.id]);
	const open = (props.drafts ?? []).filter((d) => d.status === "open");
	const d = m?.drafts;
	const cards: Array<[string, string]> = d
		? [
				[String(d.accepted), d.accepted === 1 ? "block accepted" : "blocks accepted"],
				[String(d.firstTry), "at the first version"],
				[
					d.hoursToAccept === null
						? "–"
						: d.hoursToAccept < 48
							? `${d.hoursToAccept.toFixed(1)} h`
							: `${Math.round(d.hoursToAccept / 24)} days`,
					"first version to accepted",
				],
				[
					m.agents.costUsd === null ? `${m.agents.minutes} min` : `$${m.agents.costUsd.toFixed(2)}`,
					m.agents.costUsd === null ? "of agent work" : `agents, ${m.agents.minutes} min`,
				],
			]
		: [];
	const report = [
		`${project.name}, the last 30 days`,
		...cards.map(([v, l]) => `- ${v} ${l}`),
		open.length ? `Waiting: ${open.map((x) => x.name).join(", ")}` : "Nothing waiting.",
		rum
			? `Mobile: LCP ${ms(rum.lcp.p75)}, INP ${ms(rum.inp.p75)}, CLS ${rum.cls.p75?.toFixed(2) ?? "–"}`
			: "",
	]
		.filter(Boolean)
		.join("\n");
	return (
		<div className="home">
			<span className="label">Last 30 days</span>
			<div className="home-cards">
				{cards.map(([v, l]) => (
					<div className="home-card" key={l}>
						<span className="home-big">{v}</span>
						<span className="muted small">{l}</span>
					</div>
				))}
				{!m && <p className="muted small">Counting…</p>}
			</div>
			<div className="home-two">
				<section className="home-box">
					<span className="label">Waiting on someone</span>
					{open.length === 0 && <p className="muted small">Nothing is waiting.</p>}
					<ul className="home-rows">
						{open.map((x) => (
							<li key={x.name}>
								<a href={href.draft(project.id, x.name)}>{x.name}</a>
								{ticketOf(x) && <span className="tag">{ticketOf(x)}</span>}
								<span
									className={`push-right small ${x.versions.length >= 3 ? "warn-text" : "muted"}`}
								>
									{x.versions.length} {x.versions.length === 1 ? "version" : "versions"},{" "}
									{since(x.versions[0]?.createdAt)}
								</span>
							</li>
						))}
					</ul>
				</section>
				<section className="home-box">
					<span className="label">Site health, mobile</span>
					<Health project={project} rum={rum} />
				</section>
			</div>
			<div className="row">
				<button
					type="button"
					className="btn btn-outline btn-sm"
					disabled={!m}
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(report);
							setCopied(true);
						} catch {
							setCopied(false);
						}
					}}
				>
					<Icon name={copied ? "check" : "copy"} size={14} />{" "}
					{copied ? "Copied" : "Copy the report"}
				</button>
				<span className="muted small">for the status meeting, as text</span>
			</div>
		</div>
	);
}

/** Whether page_meta has rules the page check can test. */
function usePageRules(projectId: string): boolean {
	const [rules, setRules] = useState(false);
	useEffect(() => {
		api.pageMeta(projectId).then(
			(r) =>
				setRules(
					r.properties.some(
						(p: PageMetaProperty) => p.from === "meta" && (p.required || p.allowed?.length),
					),
				),
			() => setRules(false),
		);
	}, [projectId]);
	return rules;
}

/** QA's list: drafts ready to check, and the pages with problems. */
export function QaHome(props: { project: Project; drafts: Draft[] | null }) {
	const { project } = props;
	const rum = useRum(project);
	const rules = usePageRules(project.id);
	const open = (props.drafts ?? []).filter((d) => d.status === "open");
	const slow = (rum?.pages ?? []).filter(
		(p) =>
			rating("lcp", p.lcp) === "poor" ||
			rating("inp", p.inp) === "poor" ||
			rating("cls", p.cls) === "poor",
	);
	return (
		<div className="home">
			<span className="label">Ready for QA</span>
			<section className="home-box">
				{!props.drafts && <p className="muted small">Loading…</p>}
				{props.drafts && open.length === 0 && (
					<p className="muted small">Nothing to check right now.</p>
				)}
				<ul className="home-rows">
					{open.map((d) => (
						<li key={d.name}>
							<strong>{d.name}</strong>
							{ticketOf(d) && <span className="tag">{ticketOf(d)}</span>}
							<span className="muted small">v{d.versions.at(-1)?.version ?? 1}</span>
							<a className="btn btn-accent btn-sm push-right" href={href.draft(project.id, d.name)}>
								Check
							</a>
						</li>
					))}
				</ul>
			</section>
			<p className="muted small">
				Check opens the review: pick an element with Select, say what's wrong, and Report it.
			</p>
			<div className="home-two">
				<section className="home-box">
					<span className="label">Pages with problems</span>
					{rules ? (
						<PageCheck project={project} hasRules />
					) : (
						<p className="muted small">
							No page rules yet: set required or allowed values in{" "}
							<a href={href.overview(project.id)}>Overview, page_meta</a>.
						</p>
					)}
				</section>
				<section className="home-box">
					<span className="label">Slow pages, mobile</span>
					{!project.rumDomain && <Health project={project} rum={null} />}
					{project.rumDomain && slow.length === 0 && (
						<p className="muted small">{rum ? "No page is poor." : "Reading the RUM data…"}</p>
					)}
					<ul className="home-rows">
						{slow.slice(0, 6).map((p) => (
							<li key={p.path}>
								<span className="mono">{p.path}</span>
								<span className="push-right small poor">
									{rating("lcp", p.lcp) === "poor"
										? `LCP ${ms(p.lcp)}`
										: rating("inp", p.inp) === "poor"
											? `INP ${ms(p.inp)}`
											: `CLS ${p.cls?.toFixed(2)}`}
								</span>
							</li>
						))}
					</ul>
				</section>
			</div>
		</div>
	);
}

/** The Content author's screen: the blocks with what to type in each, pages to fix, what's coming. */
export function AuthorHome(props: { project: Project; drafts: Draft[] | null }) {
	const { project } = props;
	const [inv, setInv] = useState<Inventory | null>(null);
	const [copied, setCopied] = useState("");
	const [error, setError] = useState("");
	const rules = usePageRules(project.id);
	useEffect(() => {
		api.inventory(project.id).then(setInv, (e: Error) => setError(e.message));
	}, [project.id]);
	const byName = new Map((props.drafts ?? []).map((d) => [d.name, d]));
	const open = (props.drafts ?? []).filter((d) => d.status === "open");
	const copy = async (name: string) => {
		setError("");
		try {
			const t = await api.draftContent(project.id, name);
			await navigator.clipboard.write([
				new ClipboardItem({
					"text/html": new Blob([t.html], { type: "text/html" }),
					"text/plain": new Blob([t.text], { type: "text/plain" }),
				}),
			]);
			setCopied(name);
		} catch (e) {
			setError((e as Error).message);
		}
	};
	return (
		<div className="home">
			<span className="label">The site's blocks</span>
			<section className="home-box">
				{!inv && !error && <p className="muted small">Reading the project…</p>}
				<ul className="home-rows">
					{inv?.blocks.map((b) => {
						const d = byName.get(b.name);
						return (
							<li key={b.name}>
								<strong>{b.name}</strong>
								{d?.status === "open" && <span className="tag">new</span>}
								{d ? (
									<button
										type="button"
										className="btn btn-outline btn-sm push-right"
										onClick={() => void copy(b.name)}
									>
										<Icon name={copied === b.name ? "check" : "copy"} size={14} />{" "}
										{copied === b.name ? "Copied, paste it in the page" : "Copy the table"}
									</button>
								) : (
									<span className="muted small push-right">no sample yet</span>
								)}
							</li>
						);
					})}
				</ul>
				{error && <p className="error small">{error}</p>}
			</section>
			<div className="home-two">
				<section className="home-box">
					<span className="label">Pages to fix</span>
					{rules ? (
						<PageCheck project={project} hasRules />
					) : (
						<p className="muted small">No page rules set yet, so every page is fine as it is.</p>
					)}
				</section>
				<section className="home-box">
					<span className="label">Coming soon</span>
					{open.length === 0 && <p className="muted small">No new blocks on the way.</p>}
					<ul className="home-rows">
						{open.map((d) => (
							<li key={d.name}>
								{d.name}
								{d.preview ? (
									<a
										className="push-right mono small"
										href={d.preview}
										target="_blank"
										rel="noreferrer"
									>
										preview ↗
									</a>
								) : (
									<span className="push-right muted small">in review</span>
								)}
							</li>
						))}
					</ul>
				</section>
			</div>
		</div>
	);
}
