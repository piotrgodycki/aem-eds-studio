import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon.js";
import { type DeviceFlow, type Status, api } from "./api.js";

type Github = Status["github"];

/** The header's GitHub pill: who is connected, or "Connect GitHub". */
export function GitHubPill(props: { github: Github; onChange: (g: Github) => void }) {
	const g = props.github;
	const [open, setOpen] = useState(false);
	const [connecting, setConnecting] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
		document.addEventListener("click", close);
		return () => document.removeEventListener("click", close);
	}, []);

	if (!g.connected && g.canSignIn)
		return (
			<>
				<button type="button" className="pill pill-action" onClick={() => setConnecting(true)}>
					<Icon name="github" size={14} /> Connect GitHub
				</button>
				{connecting && (
					<ConnectDialog onClose={() => setConnecting(false)} onConnected={props.onChange} />
				)}
			</>
		);
	if (!g.connected)
		return (
			<span className="pill pill-dim" title="Set GITHUB_TOKEN or run gh auth login, then reload.">
				<Icon name="github" size={14} /> Not connected
			</span>
		);
	const from =
		g.source === "app"
			? "Connected in the studio"
			: g.source === "env"
				? "From GITHUB_TOKEN"
				: "From the GitHub CLI (gh)";
	return (
		<div className="jobs-pill" ref={box}>
			<button
				type="button"
				className="pill"
				aria-expanded={open}
				title={from}
				onClick={() => setOpen((o) => !o)}
			>
				<Icon name="github" size={14} /> {g.login}
			</button>
			{open && (
				<div className="jobs-menu gh-menu">
					<p className="muted small">{from}</p>
					{g.source === "app" ? (
						<button
							type="button"
							className="btn btn-ghost"
							onClick={async () => {
								props.onChange(await api.disconnectGithub());
								setOpen(false);
							}}
						>
							Disconnect
						</button>
					) : (
						<p className="muted small">The studio doesn't manage this token.</p>
					)}
				</div>
			)}
		</div>
	);
}

/** "Connect GitHub" anywhere else (e.g. Add project), with the same dialog. */
export function ConnectGitHubButton(props: { onConnected: (g: Github) => void }) {
	const [connecting, setConnecting] = useState(false);
	return (
		<>
			<button type="button" className="btn btn-accent" onClick={() => setConnecting(true)}>
				<Icon name="github" /> Connect GitHub
			</button>
			{connecting && (
				<ConnectDialog onClose={() => setConnecting(false)} onConnected={props.onConnected} />
			)}
		</>
	);
}

/** GitHub's device flow: show the code, open github.com, wait until it's confirmed. */
function ConnectDialog(props: { onClose: () => void; onConnected: (g: Github) => void }) {
	const [flow, setFlow] = useState<DeviceFlow | null>(null);
	const [error, setError] = useState("");
	const [copied, setCopied] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const done = useRef(props);
	done.current = props;

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new attempt restarts the flow
	useEffect(() => {
		let live = true;
		let t: ReturnType<typeof setTimeout>;
		setFlow(null);
		setError("");
		api.connectGithub().then(
			(f) => {
				if (!live) return;
				setFlow(f);
				const poll = async () => {
					const s = await api.connectState().catch(() => null);
					if (!live) return;
					if (s) setFlow(s);
					if (s?.state === "done") {
						const status = await api.status();
						done.current.onConnected(status.github);
						done.current.onClose();
					} else if (!s || s.state === "pending") t = setTimeout(poll, 2000);
				};
				t = setTimeout(poll, 2000);
			},
			(e: Error) => live && setError(e.message),
		);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [attempt]);

	const openGithub = async () => {
		if (!flow) return;
		try {
			await navigator.clipboard.writeText(flow.userCode);
			setCopied(true);
		} catch {}
		window.open(flow.verificationUri, "_blank", "noopener");
	};

	const ended = flow && flow.state !== "pending" && flow.state !== "done";
	return createPortal(
		<div className="dialog-backdrop">
			<dialog open className="dialog panel" aria-modal="true" aria-labelledby="gh-title">
				<span className="eyebrow">
					<Icon name="github" size={13} /> GitHub
				</span>
				<h2 id="gh-title">Connect GitHub</h2>
				{error && <p className="error">{error}</p>}
				{!flow && !error && <p className="muted">Asking GitHub for a code…</p>}
				{flow && !ended && (
					<>
						<p className="muted">Enter this code on GitHub and allow access:</p>
						<output className="device-code" aria-live="polite">
							{flow.userCode}
						</output>
						<button type="button" className="btn btn-accent" onClick={openGithub}>
							<Icon name="external" />{" "}
							{copied ? "Code copied: open GitHub" : "Copy code and open GitHub"}
						</button>
						<p className="muted small">
							<span className="dot dot-running" /> Waiting for GitHub… The token stays on this
							computer, in the system keychain.
						</p>
					</>
				)}
				{ended && (
					<>
						<p className="error">
							{flow.state === "expired"
								? "The code expired."
								: flow.state === "denied"
									? "Access was denied on GitHub."
									: (flow.error ?? "GitHub didn't finish the sign-in.")}
						</p>
						<button
							type="button"
							className="btn btn-accent"
							onClick={() => setAttempt((a) => a + 1)}
						>
							Try again
						</button>
					</>
				)}
				<button type="button" className="btn btn-ghost dialog-close" onClick={props.onClose}>
					Cancel
				</button>
			</dialog>
		</div>,
		document.body,
	);
}
