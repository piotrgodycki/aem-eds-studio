import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, type PlanLimit, type UsageSummary, type UsageTotals } from "./api.js";
import { Icon } from "./Icon.js";

const AGENT_NAMES: Record<string, string> = {
	claude: "Claude Code",
	codex: "Codex",
	cursor: "Cursor",
	ollama: "Ollama",
	omlx: "oMLX",
	local: "Local model",
};
const WINDOW_NAMES: Record<string, string> = {
	five_hour: "5-hour limit",
	seven_day: "Weekly limit",
	seven_day_opus: "Weekly limit (Opus)",
	seven_day_sonnet: "Weekly limit (Sonnet)",
	seven_day_overage_included: "Weekly limit (with extra usage)",
	overage: "Extra usage",
};
const PERIODS = [
	["today", "Today"],
	["7d", "Last 7 days"],
	["30d", "Last 30 days"],
] as const;

const TIME = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const COUNT = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const USD = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

function LimitBar(props: { limit: PlanLimit }) {
	const { limit } = props;
	const tone =
		limit.status === "rejected" || limit.usedPercent >= 100
			? "bad"
			: limit.status === "allowed_warning" || limit.usedPercent >= 80
				? "warn"
				: "";
	return (
		<div className="usage-limit">
			<div className="usage-limit-head">
				<span>{WINDOW_NAMES[limit.window] ?? limit.window}</span>
				<strong>{limit.usedPercent}%</strong>
			</div>
			<div
				className={`usage-bar ${tone}`}
				role="progressbar"
				aria-valuenow={limit.usedPercent}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label={WINDOW_NAMES[limit.window] ?? limit.window}
			>
				<span style={{ width: `${Math.min(limit.usedPercent, 100)}%` }} />
			</div>
			{limit.resetsAt && (
				<span className="muted small">Resets {TIME.format(new Date(limit.resetsAt))}</span>
			)}
		</div>
	);
}

function Totals(props: { totals: UsageTotals | undefined }) {
	const t = props.totals;
	if (!t)
		return (
			<td colSpan={4} className="muted">
				—
			</td>
		);
	return (
		<>
			<td>{t.runs}</td>
			<td>{COUNT.format(t.tokens.input + t.tokens.output)}</td>
			<td>{COUNT.format(t.tokens.cacheRead + t.tokens.cacheWrite)}</td>
			<td>{t.costUsd ? USD.format(t.costUsd) : "—"}</td>
		</>
	);
}

/** What the subscriptions use: each plan's limits, and the tokens the studio's runs took. */
export function UsageDialog(props: { onClose: () => void }) {
	const { onClose } = props;
	const [usage, setUsage] = useState<UsageSummary | null>(null);
	const [error, setError] = useState("");
	useEffect(() => {
		api.usage().then(setUsage, (e: Error) => setError(e.message));
	}, []);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const agents = [...new Set(usage?.periods.map((p) => p.agent) ?? [])];
	return createPortal(
		<div className="dialog-backdrop">
			<dialog open className="dialog panel usage" aria-modal="true" aria-labelledby="usage-title">
				<span className="eyebrow">
					<Icon name="usage" size={13} /> Usage
				</span>
				<h2 id="usage-title">Usage</h2>
				{error && <p className="error">{error}</p>}
				{!usage && !error && <p className="muted small">Reading…</p>}
				{usage && (
					<>
						<section className="settings-section">
							<h3>Plan limits</h3>
							{usage.limits.length === 0 ? (
								<p className="muted small">
									None reported yet. Claude Code reports its 5-hour and weekly limits with each run;
									they show here after the next one.
								</p>
							) : (
								usage.limits.map((a) => (
									<div key={a.agent} className="usage-agent">
										<strong>{AGENT_NAMES[a.agent] ?? a.agent}</strong>
										<span className="muted small">As of {TIME.format(new Date(a.at))}</span>
										{a.limits.map((l) => (
											<LimitBar key={l.window} limit={l} />
										))}
									</div>
								))
							)}
						</section>
						<section className="settings-section">
							<h3>Runs in the studio</h3>
							{agents.length === 0 ? (
								<p className="muted small">No agent runs yet.</p>
							) : (
								<div className="usage-table-wrap">
									<table className="usage-table">
										<thead>
											<tr>
												<th />
												<th>Runs</th>
												<th>Tokens</th>
												<th>Cache</th>
												<th>API value</th>
											</tr>
										</thead>
										<tbody>
											{agents.flatMap((agent) =>
												PERIODS.map(([period, label]) => (
													<tr key={`${agent}-${period}`}>
														<th>
															{label}
															{agents.length > 1 && (
																<span className="muted"> · {AGENT_NAMES[agent] ?? agent}</span>
															)}
														</th>
														<Totals
															totals={
																usage.periods.find((p) => p.agent === agent && p.period === period)
																	?.totals
															}
														/>
													</tr>
												)),
											)}
											{usage.models.map((m) => (
												<tr key={m.model} className="usage-model">
													<th>{m.model} · 30 days</th>
													<Totals totals={m.totals} />
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
							<p className="muted small">
								Counts the runs the studio started. Work in your terminal or the agent's own app
								uses the same plan limits but isn't counted here. API value is what the tokens would
								cost on the API, as the agent reports it; a subscription doesn't bill it.
							</p>
						</section>
					</>
				)}
				<div className="row setup-foot">
					<button type="button" className="btn btn-accent push-right" onClick={onClose}>
						Close
					</button>
				</div>
			</dialog>
		</div>,
		document.body,
	);
}
