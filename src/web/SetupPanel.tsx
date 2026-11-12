import { useCallback, useEffect, useState } from "react";
import { AgentSignIn } from "./AgentSignIn.js";
import { api, type SetupCheck } from "./api.js";
import { ConnectGitHubButton } from "./GitHubConnect.js";
import { Icon } from "./Icon.js";

/** Checks that still need fixing; optional ones never count. */
export function openIssues(checks: SetupCheck[]): SetupCheck[] {
	return checks.filter((c) => !c.ok && c.need !== "optional");
}

function CopyCommand(props: { command: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="setup-command">
			<code>{props.command}</code>
			<button
				type="button"
				className="btn btn-ghost btn-sm"
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(props.command);
						setCopied(true);
					} catch {}
				}}
			>
				{copied ? "Copied" : "Copy"}
			</button>
		</div>
	);
}

function Fix(props: { check: SetupCheck; onFixed: () => void }) {
	const fix = props.check.fix;
	if (!fix) return null;
	switch (fix.kind) {
		case "signin":
			return <AgentSignIn agent={fix.agent} compact onSignedIn={props.onFixed} />;
		case "github":
			return <ConnectGitHubButton onConnected={props.onFixed} />;
		case "command":
			return <CopyCommand command={fix.command} />;
		case "link":
			return (
				<a className="btn btn-outline btn-sm" href={fix.url} target="_blank" rel="noreferrer">
					{fix.label} <Icon name="external" size={14} />
				</a>
			);
	}
}

/** "What the studio needs": one row per check, with its fix next to it (Settings → Setup). */
export function SetupPanel(props: { onChecked?: (checks: SetupCheck[]) => void }) {
	const [checks, setChecks] = useState<SetupCheck[] | null>(null);
	const [error, setError] = useState("");
	const { onChecked } = props;

	const load = useCallback(() => {
		setError("");
		api.setup().then(
			(c) => {
				setChecks(c);
				onChecked?.(c);
			},
			(e: Error) => setError(e.message),
		);
	}, [onChecked]);
	useEffect(load, [load]);

	const issues = checks ? openIssues(checks).length : 0;
	return (
		<div className="settings-section">
			<h3>
				{!checks
					? "Checking…"
					: issues
						? `${issues} thing${issues === 1 ? "" : "s"} to set up`
						: "All set"}
			</h3>
			<ul className="setup-list">
				{checks?.map((c) => (
					<li key={c.id} className={`setup-row ${c.ok ? "ok" : c.need}`}>
						<span className="setup-mark" aria-hidden="true">
							{c.ok ? "✓" : c.need === "required" ? "!" : "·"}
						</span>
						<div className="setup-text">
							<div className="setup-head">
								<strong>{c.title}</strong>
								{!c.ok && (
									<span className={`tag ${c.need === "required" ? "bad" : ""}`}>{c.need}</span>
								)}
							</div>
							<p className="muted small">{c.detail}</p>
							<Fix check={c} onFixed={load} />
						</div>
					</li>
				))}
			</ul>
			{error && <p className="error">{error}</p>}
			<button type="button" className="btn btn-outline" onClick={load}>
				Check again
			</button>
		</div>
	);
}
