import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AgentSignIn } from "./AgentSignIn.js";
import { ConnectGitHubButton } from "./GitHubConnect.js";
import { Icon } from "./Icon.js";
import { type SetupCheck, api } from "./api.js";

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
	if (!fix || props.check.ok) return null;
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

/** "What the studio needs": one row per check, with its fix next to it. */
export function SetupDialog(props: {
	onClose: () => void;
	onChecked?: (checks: SetupCheck[]) => void;
}) {
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
	useEffect(load, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [props.onClose]);

	const issues = checks ? openIssues(checks).length : 0;
	return createPortal(
		<div className="dialog-backdrop">
			<dialog open className="dialog panel setup" aria-modal="true" aria-labelledby="setup-title">
				<span className="eyebrow">
					<Icon name="check" size={13} /> Setup
				</span>
				<h2 id="setup-title">
					{!checks
						? "Checking…"
						: issues
							? `${issues} thing${issues === 1 ? "" : "s"} to set up`
							: "All set"}
				</h2>
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
				<div className="row setup-foot">
					<button type="button" className="btn btn-outline" onClick={load}>
						Check again
					</button>
					<button type="button" className="btn btn-accent push-right" onClick={props.onClose}>
						{issues ? "Later" : "Done"}
					</button>
				</div>
			</dialog>
		</div>,
		document.body,
	);
}
