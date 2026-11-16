import { useCallback, useEffect, useState } from "react";
import { api, type Inventory, type Project, type RumResult, type Vital } from "./api.js";
import { Icon } from "./Icon.js";
import { useOnComputer } from "./Pairing.js";

/** Google's thresholds: good up to the first number, poor above the second. */
const LIMITS = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] } as const;
type Metric = keyof typeof LIMITS;

const SHOW: Record<Metric, (v: number | null) => string> = {
	lcp: (v) => (v === null ? "–" : `${(v / 1000).toFixed(1)} s`),
	inp: (v) => (v === null ? "–" : `${Math.round(v)} ms`),
	cls: (v) => (v === null ? "–" : v.toFixed(2)),
};

const GOOD_UNDER: Record<Metric, string> = { lcp: "2.5 s", inp: "200 ms", cls: "0.1" };

function rating(m: Metric, v: number | null): string {
	if (v === null) return "muted";
	return v <= LIMITS[m][0] ? "good" : v <= LIMITS[m][1] ? "ni" : "poor";
}

const PHASES = [
	["eager", "1. Eager", "before the first paint, decides LCP"],
	["lazy", "2. Lazy", "right after, the rest of the page"],
	["delayed", "3. Delayed", "about 3 s after load: martech, tag managers, chat"],
] as const;

/**
 * The Performance tab: Core Web Vitals from the site's RUM data (eds rum), the
 * pages to look at, and what runs in each loading phase (eds inspect).
 */
export function Performance(props: { project: Project; onSaved: (p: Project) => void }) {
	const id = props.project.id;
	const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
	const [days, setDays] = useState(7);
	const [rum, setRum] = useState<RumResult | null>(null);
	const [rumError, setRumError] = useState("");
	const [busy, setBusy] = useState(false);
	const [keyState, setKeyState] = useState<{
		saved: boolean;
		env: boolean;
		canSave: boolean;
	} | null>(null);
	const [inv, setInv] = useState<Inventory | null>(null);
	const ready = !!props.project.rumDomain && !!(keyState?.saved || keyState?.env);

	useEffect(() => {
		api.rumKey(id).then(setKeyState, () => setKeyState(null));
		api.inventory(id).then(setInv, () => setInv(null));
	}, [id]);
	const read = useCallback(async () => {
		setBusy(true);
		setRumError("");
		try {
			setRum(await api.rum(id, days, device));
		} catch (e) {
			setRumError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}, [id, days, device]);
	useEffect(() => {
		if (ready) void read();
	}, [ready, read]);

	return (
		<div className="perf">
			<div className="perf-bar">
				<strong>Core Web Vitals</strong>
				<span className="muted small">
					{props.project.rumDomain
						? `from RUM, 75th percentile, ${props.project.rumDomain}`
						: "from the site's RUM data"}
				</span>
				<fieldset className="seg push-right">
					<legend className="sr-only">Device</legend>
					{(["mobile", "desktop"] as const).map((d) => (
						<button
							key={d}
							type="button"
							className={device === d ? "on" : ""}
							aria-pressed={device === d}
							onClick={() => setDevice(d)}
						>
							{d === "mobile" ? "Mobile" : "Desktop"}
						</button>
					))}
				</fieldset>
				<fieldset className="seg">
					<legend className="sr-only">Period</legend>
					{[7, 30].map((n) => (
						<button
							key={n}
							type="button"
							className={days === n ? "on" : ""}
							aria-pressed={days === n}
							onClick={() => setDays(n)}
						>
							{n} days
						</button>
					))}
				</fieldset>
			</div>
			{!ready && keyState && (
				<RumSetup
					project={props.project}
					keyState={keyState}
					onKey={setKeyState}
					onSaved={props.onSaved}
				/>
			)}
			{ready && busy && !rum && <p className="muted">Reading the RUM data…</p>}
			{rumError && <p className="error small">{rumError}</p>}
			{ready && rum && (
				<>
					<div className="perf-cards">
						{(["lcp", "inp", "cls"] as const).map((m) => (
							<VitalCard key={m} metric={m} vital={rum[m]} />
						))}
						<div className="perf-card">
							<span className="perf-label">Page views</span>
							<span className="perf-value">{compact(rum.pageViews)}</span>
							<span className="muted small">RUM samples, each standing for many views</span>
						</div>
					</div>
					{rum.pages.length > 0 && (
						<section className="perf-section">
							<h3>
								Pages to look at <span className="muted small">the worst first, {device}</span>
							</h3>
							<table className="perf-table">
								<thead>
									<tr>
										<th>Page</th>
										<th>LCP</th>
										<th>INP</th>
										<th>CLS</th>
										<th>Views</th>
									</tr>
								</thead>
								<tbody>
									{rum.pages.map((p) => (
										<tr key={p.path}>
											<td className="mono">{p.path}</td>
											{(["lcp", "inp", "cls"] as const).map((m) => (
												<td key={m} className={rating(m, p[m])}>
													{SHOW[m](p[m])}
												</td>
											))}
											<td>{compact(p.views)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</section>
					)}
				</>
			)}
			<section className="perf-section">
				<h3>
					What runs when{" "}
					<span className="muted small">read from scripts/scripts.js and scripts/delayed.js</span>
				</h3>
				{!inv && <p className="muted small">Reading the project…</p>}
				{inv && !inv.phases && (
					<p className="muted small">
						No loadEager, loadLazy or loadDelayed in scripts/scripts.js.
					</p>
				)}
				{inv?.phases && (
					<div className="perf-phases">
						{PHASES.map(([key, title, when]) => {
							const steps = inv.phases?.[key] ?? [];
							const warn = steps.find((s) => s.warn)?.warn;
							return (
								<div key={key} className="perf-phase">
									<h4>{title}</h4>
									<span className="muted small">{when}</span>
									<ul>
										{steps.map((s) => (
											<li key={s.name} className={s.warn ? "warn-text" : ""}>
												<span className="mono">
													{s.warn ? "⚠ " : ""}
													{s.name}
												</span>
												<span className="muted mono">{s.file}</span>
											</li>
										))}
									</ul>
									{warn && <p className="warn-text small">{warn}</p>}
								</div>
							);
						})}
					</div>
				)}
			</section>
		</div>
	);
}

function compact(n: number): string {
	return n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

function VitalCard(props: { metric: Metric; vital: Vital }) {
	const { metric, vital } = props;
	return (
		<div className="perf-card">
			<span className="perf-label">{metric.toUpperCase()}</span>
			<span className={`perf-value ${rating(metric, vital.p75)}`}>{SHOW[metric](vital.p75)}</span>
			<span className="muted small">good under {GOOD_UNDER[metric]}</span>
			<div
				className="perf-split"
				role="img"
				aria-label={`${Math.round(vital.good * 100)}% good, ${Math.round(vital.ni * 100)}% need work, ${Math.round(vital.poor * 100)}% poor`}
			>
				<i className="good-bg" style={{ width: `${vital.good * 100}%` }} />
				<i className="ni-bg" style={{ width: `${vital.ni * 100}%` }} />
				<i className="poor-bg" style={{ width: `${vital.poor * 100}%` }} />
			</div>
		</div>
	);
}

/** The site's domain and its RUM domain key (kept in the keychain), before there is data. */
function RumSetup(props: {
	project: Project;
	keyState: { saved: boolean; env: boolean; canSave: boolean };
	onKey: (s: { saved: boolean; env: boolean; canSave: boolean }) => void;
	onSaved: (p: Project) => void;
}) {
	const onComputer = useOnComputer();
	const [domain, setDomain] = useState(props.project.rumDomain ?? "");
	const [key, setKey] = useState("");
	const [error, setError] = useState("");
	const hasKey = props.keyState.saved || props.keyState.env;
	if (!onComputer)
		return (
			<p className="muted small">
				The site's domain and RUM key are set on the computer the studio runs on.
			</p>
		);
	return (
		<form
			className="perf-setup"
			onSubmit={async (e) => {
				e.preventDefault();
				setError("");
				try {
					if (domain !== (props.project.rumDomain ?? ""))
						props.onSaved(await api.setRumDomain(props.project.id, domain));
					if (key) props.onKey(await api.saveRumKey(props.project.id, key));
				} catch (err) {
					setError((err as Error).message);
				}
			}}
		>
			<p className="small">
				<Icon name="trend" size={14} /> Core Web Vitals come from the site's RUM data. Give the
				domain RUM records and the domain key Adobe gives for the site. The key is kept in the
				system keychain and never leaves this computer except to read the data.
			</p>
			<div className="row">
				<input
					className="mono"
					aria-label="The site's domain"
					placeholder="www.example.com"
					value={domain}
					onChange={(e) => setDomain(e.target.value)}
				/>
				{!hasKey &&
					(props.keyState.canSave ? (
						<input
							type="password"
							className="mono"
							aria-label="RUM domain key"
							placeholder="Domain key"
							value={key}
							onChange={(e) => setKey(e.target.value)}
							autoComplete="off"
						/>
					) : (
						<span className="muted small">
							Set EDS_RUM_DOMAINKEY (the browser mode has no keychain).
						</span>
					))}
				<button type="submit" className="btn btn-accent btn-sm" disabled={!domain}>
					Save
				</button>
			</div>
			{error && <p className="error small">{error}</p>}
		</form>
	);
}
