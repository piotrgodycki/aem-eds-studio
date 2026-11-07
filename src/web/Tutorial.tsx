import { type ReactNode, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon.js";
import { type AgentStatus, api } from "./api.js";

/** Asks the projects page to open "Add project" (the tutorial's last step). */
export const ADD_PROJECT_EVENT = "studio:add-project";

interface Step {
	icon: IconName;
	eyebrow: string;
	title: string;
	body: ReactNode;
}

/**
 * The first-run tutorial: shown once on the first launch (remembered in the
 * studio's settings, not the page), and again from the header's Guide.
 */
export function Tutorial(props: { onClose: () => void }) {
	const [i, setI] = useState(0);
	const steps: Step[] = [
		{
			icon: "sparkle",
			eyebrow: "Welcome",
			title: "From a design to a block, reviewed",
			body: (
				<>
					<p>
						The studio turns a design (Figma, Framer, Stitch or any page) into an AEM Edge Delivery
						block, lets you review it in rounds and accepts it into the repository.
					</p>
					<ol className="tour-list">
						<li>An AI agent on this computer writes the block.</li>
						<li>You review it on desktop, tablet and mobile, and ask for changes.</li>
						<li>Accept commits only the block, on a branch.</li>
					</ol>
					<p className="muted small">Nothing reaches the repository until someone accepts it.</p>
				</>
			),
		},
		{
			icon: "agent",
			eyebrow: "Step 1 · Agent",
			title: "Sign in to an agent with your account",
			body: <Agents />,
		},
		{
			icon: "folder",
			eyebrow: "Step 2 · Project",
			title: "Add a project",
			body: (
				<>
					<p>
						A GitHub repository (the studio clones it for you) or an Edge Delivery folder on this
						computer, chosen in the folder picker.
					</p>
					<p className="muted small">
						For GitHub, connect your account in the header, or use <code>gh auth login</code>.
						Several projects can work at the same time.
					</p>
				</>
			),
		},
		{
			icon: "design",
			eyebrow: "Step 3 · First block",
			title: "Generate your first block",
			body: (
				<>
					<p>
						In the project, paste a design link and name the block, or press{" "}
						<strong>Try the sample design</strong> to see it work without a design of your own.
					</p>
					<p className="muted small">
						The log shows each step the agent takes and what the round cost.
					</p>
				</>
			),
		},
		{
			icon: "desktop",
			eyebrow: "Step 4 · Review",
			title: "Review, request changes, accept",
			body: (
				<>
					<ul className="tour-list">
						<li>
							<Icon name="desktop" size={14} /> <Icon name="tablet" size={14} />{" "}
							<Icon name="phone" size={14} /> Check the block on each device, or full screen.
						</li>
						<li>
							<Icon name="send" size={14} /> <strong>Request changes</strong> in plain words; the
							agent makes the next version.
						</li>
						<li>
							<Icon name="check" size={14} /> <strong>Accept</strong> commits{" "}
							<code>blocks/&lt;name&gt;/</code> on a branch, with the review rounds in the message.
						</li>
					</ul>
					<p className="muted small">You can open this guide again from the header.</p>
				</>
			),
		},
	];
	const step = steps[i];
	const last = i === steps.length - 1;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [props.onClose]);

	return createPortal(
		<div className="dialog-backdrop">
			<dialog open className="dialog panel tour" aria-modal="true" aria-labelledby="tour-title">
				<span className="eyebrow">
					<Icon name={step.icon} size={13} /> {step.eyebrow}
				</span>
				<h2 id="tour-title">{step.title}</h2>
				<div className="tour-body">{step.body}</div>
				<div className="tour-foot">
					<div className="tour-dots" aria-label={`Step ${i + 1} of ${steps.length}`}>
						{steps.map((s, n) => (
							<button
								key={s.eyebrow}
								type="button"
								className={n === i ? "on" : ""}
								aria-label={`Go to ${s.eyebrow}`}
								aria-current={n === i ? "step" : undefined}
								onClick={() => setI(n)}
							/>
						))}
					</div>
					<div className="tour-nav">
						{i > 0 && (
							<button type="button" className="btn btn-ghost" onClick={() => setI(i - 1)}>
								Back
							</button>
						)}
						{last ? (
							<button
								type="button"
								className="btn btn-accent"
								onClick={() => {
									props.onClose();
									location.hash = "#/";
									setTimeout(() => window.dispatchEvent(new Event(ADD_PROJECT_EVENT)), 50);
								}}
							>
								<Icon name="plus" /> Add your first project
							</button>
						) : (
							<button type="button" className="btn btn-accent" onClick={() => setI(i + 1)}>
								Next
							</button>
						)}
					</div>
				</div>
				<button type="button" className="btn btn-ghost dialog-close" onClick={props.onClose}>
					Skip
				</button>
			</dialog>
		</div>,
		document.body,
	);
}

/** The agents eds can drive here (`eds agents`), with how to sign in to the rest. */
function Agents() {
	const [list, setList] = useState<AgentStatus[] | null>(null);
	const [error, setError] = useState("");
	const load = useCallback(() => {
		setError("");
		api.agents().then(setList, (e: Error) => setError(e.message));
	}, []);
	useEffect(load, []);

	const ready = list?.filter((a) => a.ready) ?? [];
	return (
		<>
			<p>
				The studio uses an agent you already have, signed in with your own Claude, ChatGPT or Cursor
				account. No API key, and nothing leaves this computer except what the agent sends.
			</p>
			{error && <p className="error small">{error}</p>}
			{!list && !error && <p className="muted small">Looking for agents…</p>}
			{list && (
				<ul className="agent-list">
					{list.map((a) => (
						<li key={a.type} className={a.ready ? "ok" : ""}>
							<div className="agent-head">
								<strong>{a.name}</strong>
								<span className={`tag ${a.ready ? "ok" : a.installed ? "warn" : ""}`}>
									{a.ready
										? `ready${a.model ? ` · ${a.model}` : ""}`
										: a.installed
											? "not signed in"
											: "not installed"}
								</span>
							</div>
							{!a.ready && <Hint text={a.installed ? a.signIn : a.install} />}
						</li>
					))}
				</ul>
			)}
			<div className="row">
				<button type="button" className="btn btn-outline" onClick={load}>
					Check again
				</button>
				{list && (
					<span className={`small ${ready.length ? "ok-text" : "muted"}`}>
						{ready.length
							? `${ready.map((a) => a.name).join(", ")} ready.`
							: "Sign in to one, then check again."}
					</span>
				)}
			</div>
		</>
	);
}

/** A hint whose `commands` can be copied. */
function Hint(props: { text: string }) {
	const parts = props.text.split(/(`[^`]+`)/);
	const command =
		props.text.match(/`([^`]+)`/)?.[1] ?? (/^npm |^brew /.test(props.text) ? props.text : "");
	const [copied, setCopied] = useState(false);
	return (
		<div className="agent-hint">
			<span className="muted small">
				{command === props.text ? (
					<code>{props.text}</code>
				) : (
					parts.map((p, n) =>
						p.startsWith("`") ? (
							// biome-ignore lint/suspicious/noArrayIndexKey: static text split
							<code key={n}>{p.slice(1, -1)}</code>
						) : (
							p
						),
					)
				)}
			</span>
			{command && (
				<button
					type="button"
					className="btn btn-ghost btn-sm"
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(command);
							setCopied(true);
						} catch {}
					}}
				>
					{copied ? "Copied" : "Copy"}
				</button>
			)}
		</div>
	);
}
