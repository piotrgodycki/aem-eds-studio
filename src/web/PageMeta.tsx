import { useCallback, useEffect, useRef, useState } from "react";
import {
	api,
	type Job,
	type OpenedPull,
	type PageMetaCheck,
	type PageMetaProperty,
	type Project,
} from "./api.js";
import { useContent } from "./ContentLink.js";
import { Icon } from "./Icon.js";
import { JobLog } from "./JobLog.js";

const SOURCES: Array<[PageMetaProperty["from"], string]> = [
	["meta", "Page metadata"],
	["url", "URL part"],
	["query", "Query parameter"],
	["fixed", "Fixed value"],
	["function", "Function"],
];

type Row = PageMetaProperty & { rowKey: number };

/** What the base fields are, so nobody adds them again. */
const BASE = "path, title, template, theme, language, environment, referrer";

/** A sample page for the preview, with a query so a query parameter shows something. */
const SAMPLE = "/offers/winter?utm_campaign=xmas";

/** How a property's value looks on the sample page (metadata and functions are only known in the browser). */
function sampleValue(p: PageMetaProperty, sample: URL): string {
	switch (p.from) {
		case "meta":
			return `‹${p.key || "field"} from the page's metadata›`;
		case "url":
			return JSON.stringify(sample.pathname.split("/").filter(Boolean)[(p.index ?? 1) - 1] ?? "");
		case "query":
			return JSON.stringify(sample.searchParams.get(p.key ?? "") ?? "");
		case "fixed":
			return JSON.stringify(p.value ?? "");
		case "function":
			return `‹${p.key || "fn"}()›`;
	}
}

/**
 * page_meta in Overview: the properties every page pushes before GTM and GA,
 * a preview of the event, Save (a pull request on a GitHub project) and a check
 * of the published pages against the rules.
 */
export function PageMetaCard(props: { project: Project }) {
	const id = props.project.id;
	const [props0, setProps0] = useState<PageMetaProperty[] | null>(null);
	// Each row carries a key of its own, so editing or removing one never mixes up the others.
	const [list, setRows] = useState<Row[]>([]);
	const nextKey = useRef(0);
	const keyed = useCallback(
		(ps: PageMetaProperty[]) => ps.map((p) => ({ ...p, rowKey: nextKey.current++ })),
		[],
	);
	const [written, setWritten] = useState<Record<string, boolean>>({});
	const [error, setError] = useState("");
	const [job, setJob] = useState<Job | null>(null);
	const [branch, setBranch] = useState<string | null>(null);
	const [pull, setPull] = useState<OpenedPull | null>(null);
	const [sample, setSample] = useState(SAMPLE);
	const load = useCallback(
		() =>
			api.pageMeta(id).then(
				(r) => {
					setProps0(r.properties);
					setRows(keyed(r.properties));
					setWritten(r.written);
				},
				(e: Error) => setError(e.message),
			),
		[id, keyed],
	);
	useEffect(() => {
		void load();
	}, [load]);
	const plain = list.map(({ rowKey, ...p }) => p);

	const changed = JSON.stringify(plain) !== JSON.stringify(props0);
	const set = (i: number, patch: Partial<PageMetaProperty>) =>
		setRows(list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
	const toWrite = list.filter((p) => p.from === "function" && p.key && !written[p.key]).length;
	const github = props.project.source.type === "github";

	const save = async () => {
		setError("");
		setPull(null);
		try {
			const r = await api.savePageMeta(id, plain);
			setBranch(r.branch);
			setJob(r.job);
		} catch (e) {
			setError((e as Error).message);
		}
	};
	const saved = async (j: Job) => {
		// A failed save keeps what you typed, so it can be fixed and saved again.
		if (j.status !== "done") return;
		void load();
		if (!branch) return;
		try {
			setPull(await api.pageMetaPull(id, branch));
		} catch (e) {
			setError((e as Error).message);
		}
	};

	let url: URL;
	try {
		url = new URL(sample, "https://example.com");
	} catch {
		url = new URL(SAMPLE, "https://example.com");
	}

	return (
		<details className="overview-card page-meta" open>
			<summary>
				<Icon name="chevron" size={14} />
				<strong>page_meta</strong>
				<span className="overview-count">{list.length}</span>
				<span className="muted small overview-summary">
					pushed on every page before GTM and GA load
				</span>
			</summary>
			<p className="muted small">
				The base fields ({BASE}) are always there. Add the properties your tags need. Saved in
				.edsrc.json, and scripts/page-meta.js is written from it.
			</p>
			<div className="pm-cols">
				<div className="pm-table">
					{list.map((p, i) => (
						<PropertyRow
							key={p.rowKey}
							p={p}
							written={p.key ? written[p.key] : false}
							onChange={(patch) => set(i, patch)}
							onRemove={() => setRows(list.filter((_, j) => j !== i))}
						/>
					))}
					<button
						type="button"
						className="btn btn-ghost btn-sm"
						onClick={() => setRows([...list, ...keyed([{ name: "", from: "meta", key: "" }])])}
					>
						<Icon name="plus" size={14} /> Add a property
					</button>
				</div>
				<div className="pm-preview">
					<label className="muted small">
						What{" "}
						<input
							className="mono pm-sample"
							aria-label="A sample page"
							value={sample}
							onChange={(e) => setSample(e.target.value)}
						/>{" "}
						pushes
					</label>
					<pre className="mono">
						{"dataLayer.push({\n  event: 'page_meta',\n  page: {\n"}
						{`    path: ${JSON.stringify(url.pathname)},\n    title: ‹the page's title›,\n    …the base fields\n`}
						{list
							.filter((p) => p.name)
							.map((p) => `    ${p.name}: ${sampleValue(p, url)},\n`)
							.join("")}
						{"  },\n});"}
					</pre>
				</div>
			</div>
			<div className="pm-foot">
				<span className="muted small">
					{toWrite > 0 &&
						`The agent writes ${toWrite} ${toWrite === 1 ? "function" : "functions"} in scripts/page-meta-custom.js. `}
					{github
						? "Saving opens a pull request with .edsrc.json and the scripts."
						: "Saving writes .edsrc.json and the scripts into the folder."}
				</span>
				<button
					type="button"
					className="btn btn-accent btn-sm"
					disabled={!changed || (job !== null && !job.endedAt)}
					onClick={() => void save()}
				>
					{github ? "Save as pull request" : "Save"}
				</button>
			</div>
			{job && (
				<JobLog key={job.id} job={job} title="Saving page_meta" onEnd={(j) => void saved(j)} />
			)}
			{pull && (
				<p className="small">
					<a href={pull.url} target="_blank" rel="noreferrer">
						Pull request #{pull.number} ↗
					</a>
				</p>
			)}
			{error && <p className="error small">{error}</p>}
			<PageCheck
				project={props.project}
				hasRules={list.some((p) => p.from === "meta" && (p.required || p.allowed?.length))}
			/>
		</details>
	);
}

function PropertyRow(props: {
	p: PageMetaProperty;
	written: boolean;
	onChange: (patch: Partial<PageMetaProperty>) => void;
	onRemove: () => void;
}) {
	const { p } = props;
	const keyLabel =
		p.from === "meta"
			? "Metadata field, e.g. page-type"
			: p.from === "query"
				? "Query parameter, e.g. utm_campaign"
				: "Function name, e.g. isLoggedIn";
	return (
		<div className="pm-row">
			<input
				className="mono"
				aria-label="Property name"
				placeholder="pageType"
				value={p.name}
				onChange={(e) => props.onChange({ name: e.target.value.replace(/[^\w$]/g, "") })}
			/>
			<select
				aria-label="Where its value comes from"
				value={p.from}
				onChange={(e) =>
					props.onChange({
						from: e.target.value as PageMetaProperty["from"],
						// Only metadata, a query parameter and a function are named by a key.
						key: ["meta", "query", "function"].includes(e.target.value) ? "" : undefined,
						// A URL part starts as the first one, as the field shows.
						index: e.target.value === "url" ? 1 : undefined,
						value: undefined,
					})
				}
			>
				{SOURCES.map(([v, label]) => (
					<option key={v} value={v}>
						{label}
					</option>
				))}
			</select>
			{(p.from === "meta" || p.from === "query" || p.from === "function") && (
				<input
					className="mono"
					aria-label={keyLabel}
					placeholder={keyLabel.split(", e.g. ")[1]}
					value={p.key ?? ""}
					onChange={(e) => props.onChange({ key: e.target.value.replace(/[^\w:.$-]/g, "") })}
				/>
			)}
			{p.from === "url" && (
				<input
					type="number"
					min={1}
					max={10}
					aria-label="Which URL part, 1 for the first"
					value={p.index ?? 1}
					onChange={(e) => props.onChange({ index: Number(e.target.value) || 1 })}
				/>
			)}
			{p.from === "fixed" && (
				<input
					aria-label="The fixed value"
					placeholder="acme"
					value={p.value ?? ""}
					onChange={(e) => props.onChange({ value: e.target.value })}
				/>
			)}
			<button
				type="button"
				className="icon-btn icon-btn-sm"
				aria-label={`Remove ${p.name || "this property"}`}
				title="Remove"
				onClick={props.onRemove}
			>
				<Icon name="close" size={12} />
			</button>
			{p.from === "meta" && (
				<div className="pm-rule">
					<label className="small">
						<input
							type="checkbox"
							checked={!!p.required}
							onChange={(e) => props.onChange({ required: e.target.checked || undefined })}
						/>{" "}
						required
					</label>
					<input
						className="mono"
						aria-label="Allowed values, separated by commas"
						placeholder="allowed values: home, category, detail (empty: any)"
						value={(p.allowed ?? []).join(", ")}
						onChange={(e) => {
							const allowed = e.target.value
								.split(",")
								.map((s) => s.trim())
								.filter(Boolean);
							props.onChange({ allowed: allowed.length ? allowed : undefined });
						}}
					/>
				</div>
			)}
			{p.from === "function" && (
				<div className="pm-rule">
					<textarea
						rows={2}
						aria-label="What it returns, for the agent"
						placeholder="What it returns, e.g. whether the visitor is signed in: the session cookie is there"
						value={p.describe ?? ""}
						onChange={(e) => props.onChange({ describe: e.target.value })}
					/>
					<span className={`small ${props.written ? "ok-text" : "muted"}`}>
						{props.written
							? "Written in scripts/page-meta-custom.js"
							: "✦ The agent writes it when you save"}
					</span>
				</div>
			)}
		</div>
	);
}

/** The published pages against the rules: what's missing or not allowed, with a link to edit each. */
function PageCheck(props: { project: Project; hasRules: boolean }) {
	const [result, setResult] = useState<PageMetaCheck | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const content = useContent(props.project);
	const editLink = (path: string) =>
		content?.link?.source === "da"
			? `${content.link.url.replace(/\/$/, "")}${path === "/" ? "/index" : path}`
			: null;
	if (!props.hasRules) return null;
	return (
		<div className="pm-check">
			<div className="row">
				<strong className="small">Pages</strong>
				<span className="muted small">
					the published pages against the required and allowed values
				</span>
				<button
					type="button"
					className="btn btn-outline btn-sm push-right"
					disabled={busy}
					onClick={async () => {
						setBusy(true);
						setError("");
						try {
							setResult(await api.checkPageMeta(props.project.id));
						} catch (e) {
							setError((e as Error).message);
						} finally {
							setBusy(false);
						}
					}}
				>
					{busy ? (
						<span className="spinner spinner-sm" aria-hidden="true" />
					) : (
						<Icon name="history" size={14} />
					)}{" "}
					Check pages
				</button>
			</div>
			{result && (
				<>
					<p className="small">
						<span className="ok-text">{result.checked - result.pages.length} match</span>
						{result.pages.length > 0 && (
							<span className="warn-text"> · {result.pages.length} to fix</span>
						)}
						<span className="muted"> · {result.base}</span>
					</p>
					{result.pages.length > 0 && (
						<ul className="pm-pages">
							{result.pages.map((pg) => (
								<li key={pg.path}>
									<span className="mono">{pg.path}</span>
									<span className="warn-text small">{pg.problems.join(", ")}</span>
									{editLink(pg.path) && (
										<a
											className="btn btn-ghost btn-sm"
											href={editLink(pg.path) ?? ""}
											target="_blank"
											rel="noreferrer"
										>
											Edit in DA ↗
										</a>
									)}
								</li>
							))}
						</ul>
					)}
				</>
			)}
			{error && <p className="error small">{error}</p>}
		</div>
	);
}
