import { useCallback, useEffect, useRef, useState } from "react";
import {
	api,
	type Job,
	type OpenedPull,
	type PageMetaCheck,
	type PageMetaProperty,
	type Project,
} from "./api.js";
import { confirmAction } from "./Confirm.js";
import { useContent } from "./ContentLink.js";
import { Icon } from "./Icon.js";
import { JobLog } from "./JobLog.js";

const SOURCES: Array<[PageMetaProperty["from"], string]> = [
	["meta", "Page metadata"],
	["url", "URL part"],
	["query", "Query parameter"],
	["fixed", "Fixed value"],
	["function", "Function"],
	["builtin", "Built in"],
];

/** What every page knows about itself, for a built-in field, and how it looks on the sample page. */
const BUILTINS: Array<[key: string, label: string]> = [
	["path", "URL path"],
	["title", "Title"],
	["language", "Language"],
	["environment", "Environment"],
	["referrer", "Referrer"],
	["timestamp", "Timestamp"],
	["host", "Host"],
];

type Row = PageMetaProperty & { rowKey: number };

/** Where a new event starts: today's fields, the names GA4 and the Adobe Client Data Layer use, or nothing. */
const PRESETS: Array<[label: string, fields: PageMetaProperty[]]> = [
	["Empty", []],
	[
		"Default (page.*)",
		[
			{ name: "page.path", from: "builtin", key: "path" },
			{ name: "page.title", from: "builtin", key: "title" },
			{ name: "page.template", from: "meta", key: "template" },
			{ name: "page.theme", from: "meta", key: "theme" },
			{ name: "page.language", from: "builtin", key: "language" },
			{ name: "page.environment", from: "builtin", key: "environment" },
			{ name: "page.referrer", from: "builtin", key: "referrer" },
		],
	],
	[
		"GA4",
		[
			{ name: "page_path", from: "builtin", key: "path" },
			{ name: "page_title", from: "builtin", key: "title" },
			{ name: "page_referrer", from: "builtin", key: "referrer" },
			{ name: "language", from: "builtin", key: "language" },
			{ name: "content_group", from: "meta", key: "template" },
		],
	],
	[
		"Adobe Client Data Layer",
		[
			{ name: "web.webPageDetails.name", from: "builtin", key: "title" },
			{ name: "web.webPageDetails.URL", from: "builtin", key: "path" },
			{ name: "web.webPageDetails.siteSection", from: "url", index: 1 },
			{ name: "web.webReferrer.URL", from: "builtin", key: "referrer" },
			{ name: "environment", from: "builtin", key: "environment" },
		],
	],
];

/** A sample page for the preview, with a query so a query parameter shows something. */
const SAMPLE = "/offers/winter?utm_campaign=xmas";

/** A sample value as the generated code writes it: in single quotes. */
const quoted = (v: string) => `'${v.replace(/'/g, "\\'")}'`;

/** How a property's value looks on the sample page (metadata and functions are only known in the browser). */
function sampleValue(p: PageMetaProperty, sample: URL): string {
	switch (p.from) {
		case "meta":
			return `‹${p.key || "field"} from the page's metadata›`;
		case "url":
			return quoted(sample.pathname.split("/").filter(Boolean)[(p.index ?? 1) - 1] ?? "");
		case "query":
			return quoted(sample.searchParams.get(p.key ?? "") ?? "");
		case "fixed":
			return quoted(p.value ?? "");
		case "function":
			return `‹${p.key || "fn"}()›`;
		case "builtin":
			return p.key === "path"
				? quoted(sample.pathname)
				: `‹${BUILTINS.find(([k]) => k === p.key)?.[1].toLowerCase() ?? "value"}›`;
	}
}

/** The event on the sample page as the data layer gets it: dotted names nested, in order. */
function previewText(event: string, rows: PageMetaProperty[], sample: URL): string {
	type Node = Map<string, Node | string>;
	const root: Node = new Map();
	for (const p of rows) {
		if (!p.name) continue;
		const parts = p.name.split(".").filter(Boolean);
		let node = root;
		for (const part of parts.slice(0, -1)) {
			const next = node.get(part);
			if (next instanceof Map) node = next;
			else {
				const made: Node = new Map();
				node.set(part, made);
				node = made;
			}
		}
		const last = parts.at(-1);
		if (last) node.set(last, sampleValue(p, sample));
	}
	const lines = [`dataLayer.push({`, `  event: '${event || "page_meta"}',`];
	const walk = (node: Node, pad: string) => {
		for (const [k, v] of node) {
			if (v instanceof Map) {
				lines.push(`${pad}${k}: {`);
				walk(v, `${pad}  `);
				lines.push(`${pad}},`);
			} else lines.push(`${pad}${k}: ${v},`);
		}
	};
	walk(root, "  ");
	lines.push("});");
	return lines.join("\n");
}

/**
 * page_meta in Overview: the properties every page pushes before GTM and GA,
 * a preview of the event, Save (a pull request on a GitHub project) and a check
 * of the published pages against the rules.
 */
export function PageMetaCard(props: { project: Project }) {
	const id = props.project.id;
	const [props0, setProps0] = useState<PageMetaProperty[] | null>(null);
	const [event0, setEvent0] = useState("page_meta");
	const [eventName, setEventName] = useState("page_meta");
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
					setEvent0(r.event);
					setEventName(r.event);
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

	const changed = eventName !== event0 || JSON.stringify(plain) !== JSON.stringify(props0);
	const set = (i: number, patch: Partial<PageMetaProperty>) =>
		setRows(list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
	const toWrite = list.filter((p) => p.from === "function" && p.key && !written[p.key]).length;
	const github = props.project.source.type === "github";

	const save = async () => {
		setError("");
		setPull(null);
		try {
			const r = await api.savePageMeta(id, eventName, plain);
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
				<strong>{event0}</strong>
				<span className="overview-count">{list.length}</span>
				<span className="muted small overview-summary">
					pushed on every page before GTM and GA load
				</span>
			</summary>
			<p className="muted small">
				The whole event is yours: its name and every field. A dot nests a field, so site.section
				goes into site. Saved in .edsrc.json, and scripts/page-meta.js is written from it.
			</p>
			<div className="pm-bar">
				<label className="muted small">
					Event name{" "}
					<input
						className="mono"
						aria-label="The event's name"
						value={eventName}
						onChange={(e) => setEventName(e.target.value.replace(/[^\w:.-]/g, ""))}
					/>
				</label>
				<span className="muted small">Start from</span>
				<fieldset className="seg">
					<legend className="sr-only">Start from</legend>
					{PRESETS.map(([label, fields]) => (
						<button
							key={label}
							type="button"
							onClick={async () => {
								const ok =
									!list.length ||
									(await confirmAction({
										title: `Start from ${label}?`,
										detail: "The fields here are replaced. Nothing is saved until you save.",
										action: "Replace the fields",
									}));
								if (ok) setRows(keyed(fields));
							}}
						>
							{label}
						</button>
					))}
				</fieldset>
			</div>
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
						<Icon name="plus" size={14} /> Add a field
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
					<pre className="mono">{previewText(eventName, plain, url)}</pre>
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
				aria-label="Field name, a dot nests it"
				placeholder="page.type"
				value={p.name}
				onChange={(e) => props.onChange({ name: e.target.value.replace(/[^\w$.]/g, "") })}
			/>
			<select
				aria-label="Where its value comes from"
				value={p.from}
				onChange={(e) =>
					props.onChange({
						from: e.target.value as PageMetaProperty["from"],
						// Only metadata, a query parameter and a function are named by a key; a built-in picks one.
						key:
							e.target.value === "builtin"
								? "path"
								: ["meta", "query", "function"].includes(e.target.value)
									? ""
									: undefined,
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
			{p.from === "builtin" && (
				<select
					aria-label="Which value the page knows"
					value={p.key ?? "path"}
					onChange={(e) => props.onChange({ key: e.target.value })}
				>
					{BUILTINS.map(([k, label]) => (
						<option key={k} value={k}>
							{label}
						</option>
					))}
				</select>
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
export function PageCheck(props: { project: Project; hasRules: boolean }) {
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
