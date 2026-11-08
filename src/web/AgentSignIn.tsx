import { useState } from "react";
import { Icon } from "./Icon.js";
import { desktop } from "./api.js";

const AGENTS: Record<string, { name: string; command: string; steps: string }> = {
	claude: {
		name: "Claude Code",
		command: "claude",
		steps:
			"type /login, sign in with your Claude account in the browser, then come back and try again",
	},
	codex: {
		name: "Codex",
		command: "codex login",
		steps: "sign in with your ChatGPT account in the browser, then come back and try again",
	},
};

/** Which agent a failed job's log says isn't signed in, if any. */
export function signedOutAgent(log: string): string | null {
	if (!/not logged in|please run \/login|codex login|not authenticated|unauthori[sz]ed/i.test(log))
		return null;
	if (/codex/i.test(log)) return "codex";
	return "claude";
}

/** "Your agent isn't signed in": a button that opens its sign-in in a terminal, or the command to run. */
export function AgentSignIn(props: { agent: string; compact?: boolean }) {
	const a = AGENTS[props.agent];
	const [opened, setOpened] = useState(false);
	const [copied, setCopied] = useState(false);
	if (!a) return null;
	const canOpen = !!desktop?.agentLogin;
	return (
		<div className={`signin ${props.compact ? "signin-compact" : ""}`}>
			{!props.compact && (
				<p>
					<strong>{a.name} isn't signed in on this computer.</strong> Sign in once with your account
					(no API key); the studio uses that login from then on.
				</p>
			)}
			<div className="row">
				{canOpen ? (
					<button
						type="button"
						className="btn btn-accent"
						onClick={async () => setOpened(!!(await desktop?.agentLogin?.(props.agent)))}
					>
						<Icon name="agent" /> Sign in to {a.name}
					</button>
				) : (
					<button
						type="button"
						className="btn btn-outline"
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(a.command);
								setCopied(true);
							} catch {}
						}}
					>
						{copied ? "Copied" : `Copy “${a.command}”`}
					</button>
				)}
			</div>
			<p className="muted small">
				{canOpen
					? opened
						? `A terminal opened with ${a.command}: ${a.steps}.`
						: `Opens a terminal with ${a.command}; there, ${a.steps}.`
					: `Run ${a.command} in a terminal; there, ${a.steps}.`}
			</p>
		</div>
	);
}
