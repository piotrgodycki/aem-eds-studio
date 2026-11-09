import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.js";
import { type AgentAuth, api } from "./api.js";

const AGENTS: Record<string, { name: string; account: string }> = {
	claude: { name: "Claude Code", account: "your Claude account" },
	codex: { name: "Codex", account: "your ChatGPT account" },
};

/** Which agent a failed job's log says isn't signed in, if any. */
export function signedOutAgent(log: string): string | null {
	if (!/not logged in|please run \/login|codex login|not authenticated|unauthori[sz]ed/i.test(log))
		return null;
	if (/codex/i.test(log)) return "codex";
	return "claude";
}

/**
 * "Your agent isn't signed in": signs in with the provider's own login, in the
 * browser. The agent's CLI opens the sign-in page and keeps the login; no
 * terminal, no API key.
 */
export function AgentSignIn(props: { agent: string; compact?: boolean; onSignedIn?: () => void }) {
	const a = AGENTS[props.agent];
	const [auth, setAuth] = useState<AgentAuth | null>(null);
	const [code, setCode] = useState("");
	const [error, setError] = useState("");
	const waiting = auth?.status === "waiting";
	const onSignedIn = useRef(props.onSignedIn);
	onSignedIn.current = props.onSignedIn;

	useEffect(() => {
		if (!waiting) return;
		const t = setInterval(async () => {
			try {
				const next = await api.agentAuth(props.agent);
				setAuth(next);
				if (next.status === "done") onSignedIn.current?.();
			} catch {}
		}, 1500);
		return () => clearInterval(t);
	}, [waiting, props.agent]);

	if (!a) return null;
	const run = async (fn: () => Promise<AgentAuth>) => {
		setError("");
		try {
			setAuth(await fn());
		} catch (err) {
			setError((err as Error).message);
		}
	};

	if (auth?.status === "done")
		return (
			<div className={`signin ${props.compact ? "signin-compact" : ""}`}>
				<p className="signin-ok">
					<Icon name="check" /> Signed in to {a.name}. {props.compact ? "" : "Run the job again."}
				</p>
			</div>
		);

	return (
		<div className={`signin ${props.compact ? "signin-compact" : ""}`}>
			{!props.compact && (
				<p>
					<strong>{a.name} isn't signed in on this computer.</strong> Sign in once with {a.account}
					(no API key); the studio uses that login from then on.
				</p>
			)}
			{waiting ? (
				<div className="stack">
					<p className="muted small">
						Finish signing in on the {a.name} page in your browser.
						{auth?.url && (
							<>
								{" "}
								Didn't open?{" "}
								<a href={auth.url} target="_blank" rel="noreferrer">
									Open the sign-in page
								</a>
								.
							</>
						)}
					</p>
					{auth?.askCode && (
						<form
							className="row"
							onSubmit={(e) => {
								e.preventDefault();
								if (code.trim()) void run(() => api.agentAuthCode(props.agent, code));
								setCode("");
							}}
						>
							<input
								className="mono"
								placeholder="Code from the page, if it shows one"
								aria-label="Code from the sign-in page"
								value={code}
								onChange={(e) => setCode(e.target.value)}
							/>
							<button type="submit" className="btn btn-accent" disabled={!code.trim()}>
								Continue
							</button>
						</form>
					)}
					<div className="row">
						<span className="muted small signin-wait">
							<span className="signin-dot" aria-hidden="true" /> Waiting for the sign-in…
						</span>
						<button
							type="button"
							className="btn btn-outline"
							onClick={() => void run(() => api.agentAuthCancel(props.agent))}
						>
							Cancel
						</button>
					</div>
				</div>
			) : (
				<div className="row">
					<button
						type="button"
						className="btn btn-accent"
						onClick={() => void run(() => api.agentAuthStart(props.agent))}
					>
						<Icon name="agent" /> Sign in to {a.name}
					</button>
				</div>
			)}
			{(error || auth?.status === "error") && <p className="error">{error || auth?.error}</p>}
		</div>
	);
}
