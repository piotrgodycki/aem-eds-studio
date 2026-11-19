import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { ROLES, type WorkRole } from "./workRole.js";

/** What each role gets, in a line under its picture. */
const BLURB: Record<WorkRole, string> = {
	manager: "The 30-day report, what waits on someone, the site's health.",
	qa: "The drafts to check, Select and Report, the pages with problems.",
	developer: "The chat and the agents, drafts, blocks, the site's performance.",
	content: "The blocks to use with their tables, pages to fix in DA.",
};

/**
 * Each role's picture, drawn with the theme's colours (they follow light and dark):
 * a chart for the manager, a magnifier over a picked element for QA, a terminal
 * for the developer, a page and a block for the content author.
 */
const ART: Record<WorkRole, ReactNode> = {
	manager: (
		<svg viewBox="0 0 120 76" fill="none" aria-hidden="true">
			<rect x="6" y="46" width="14" height="24" rx="3" fill="var(--line)" />
			<rect x="26" y="34" width="14" height="36" rx="3" fill="var(--line)" />
			<rect x="46" y="22" width="14" height="48" rx="3" fill="var(--accent)" />
			<rect x="66" y="30" width="14" height="40" rx="3" fill="var(--line)" />
			<path
				d="M8 38 L32 26 L52 14 L74 20 L96 8"
				stroke="var(--ok)"
				strokeWidth="2.5"
				strokeLinecap="round"
			/>
			<circle cx="96" cy="8" r="4" fill="var(--ok)" />
			<rect x="86" y="44" width="28" height="26" rx="5" stroke="var(--muted)" strokeWidth="1.5" />
			<path
				d="M92 52h16M92 58h10M92 64h12"
				stroke="var(--muted)"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
		</svg>
	),
	qa: (
		<svg viewBox="0 0 120 76" fill="none" aria-hidden="true">
			<rect x="10" y="8" width="70" height="56" rx="6" stroke="var(--muted)" strokeWidth="1.5" />
			<rect x="18" y="18" width="34" height="6" rx="2" fill="var(--line)" />
			<rect x="18" y="30" width="52" height="4" rx="2" fill="var(--line)" />
			<rect
				x="24"
				y="40"
				width="32"
				height="16"
				rx="3"
				stroke="var(--accent)"
				strokeWidth="2"
				strokeDasharray="4 3"
			/>
			<circle cx="88" cy="46" r="14" stroke="var(--accent)" strokeWidth="2.5" />
			<path d="M98 56 L110 68" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
			<path
				d="M82 46l4 4 8-8"
				stroke="var(--ok)"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	),
	developer: (
		<svg viewBox="0 0 120 76" fill="none" aria-hidden="true">
			<rect
				x="8"
				y="10"
				width="104"
				height="56"
				rx="7"
				fill="var(--ink)"
				stroke="var(--line)"
				strokeWidth="1.5"
			/>
			<circle cx="18" cy="20" r="2.5" fill="var(--bad)" />
			<circle cx="26" cy="20" r="2.5" fill="var(--warn)" />
			<circle cx="34" cy="20" r="2.5" fill="var(--ok)" />
			<path
				d="M18 34l8 6-8 6"
				stroke="var(--accent)"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<rect x="32" y="44" width="16" height="3" rx="1.5" fill="var(--paper)" />
			<rect x="56" y="32" width="44" height="4" rx="2" fill="var(--line)" />
			<rect x="56" y="40" width="30" height="4" rx="2" fill="var(--ok)" />
			<rect x="56" y="48" width="38" height="4" rx="2" fill="var(--line)" />
		</svg>
	),
	content: (
		<svg viewBox="0 0 120 76" fill="none" aria-hidden="true">
			<rect x="8" y="8" width="58" height="60" rx="5" stroke="var(--muted)" strokeWidth="1.5" />
			<rect x="16" y="16" width="42" height="18" rx="3" fill="var(--line)" />
			<path
				d="M20 30l8-8 6 6 5-4 9 6"
				stroke="var(--accent)"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
			<rect x="16" y="40" width="34" height="4" rx="2" fill="var(--paper)" />
			<rect x="16" y="48" width="42" height="3" rx="1.5" fill="var(--line)" />
			<rect x="16" y="55" width="28" height="3" rx="1.5" fill="var(--line)" />
			<rect x="74" y="20" width="38" height="16" rx="4" fill="var(--accent)" />
			<path d="M84 28h18" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
			<path
				d="M80 48 L104 48 M92 42 L104 48 L92 54"
				stroke="var(--muted)"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	),
};

/**
 * "What do you do on this project?": asked the first time a project opens on
 * this device. It has no close button, since the project's first screen depends
 * on the answer. Later changes go through the role switch in the header.
 */
export function RoleDialog(props: { projectName: string; onPick: (r: WorkRole) => void }) {
	const [picked, setPicked] = useState<WorkRole>("developer");
	return createPortal(
		<div className="dialog-backdrop">
			<dialog
				open
				className="dialog panel role-dialog"
				aria-modal="true"
				aria-labelledby="role-title"
			>
				<span className="eyebrow">Welcome to {props.projectName}</span>
				<h2 id="role-title">What do you do on this project?</h2>
				<p className="muted">
					The studio opens on your screen and puts your tabs first. Everything else stays one click
					away, and you can switch any time.
				</p>
				<fieldset className="role-cards">
					<legend className="sr-only">Your role</legend>
					{ROLES.map(([role, name]) => (
						<button
							key={role}
							type="button"
							className={`role-card${picked === role ? " on" : ""}`}
							aria-pressed={picked === role}
							onClick={() => setPicked(role)}
							onDoubleClick={() => props.onPick(role)}
						>
							<span className="role-art">{ART[role]}</span>
							<strong>{name}</strong>
							<span className="muted small">{BLURB[role]}</span>
						</button>
					))}
				</fieldset>
				<div className="role-foot">
					<span className="muted small">
						Kept on this device. Change it from the project's header.
					</span>
					<button type="button" className="btn btn-accent" onClick={() => props.onPick(picked)}>
						Confirm
					</button>
				</div>
			</dialog>
		</div>,
		document.body,
	);
}
