import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
	api,
	desktop,
	type FigmaTokenStatus,
	type Settings,
	type SetupCheck,
	type Status,
} from "./api.js";
import { ChooseRepos, GitHubPill } from "./GitHubConnect.js";
import { Icon } from "./Icon.js";
import { SetupPanel } from "./SetupPanel.js";

type SwitchName = "autoUpdates" | "github";

/** An on/off switch with what it does; the whole row toggles it. */
function Switch(props: {
	label: string;
	hint: string;
	on: boolean;
	onChange: (on: boolean) => void;
}) {
	return (
		<label className="switch-row">
			<span className="stack">
				<strong>{props.label}</strong>
				<span className="muted small">{props.hint}</span>
			</span>
			<button
				type="button"
				role="switch"
				aria-checked={props.on}
				className={`switch ${props.on ? "on" : ""}`}
				onClick={() => props.onChange(!props.on)}
			>
				<span />
			</button>
		</label>
	);
}

/** Who is signed in, and signing out (the token is forgotten on this computer). */
function GithubAccount(props: {
	github: Status["github"];
	onChange: (g: Status["github"]) => void;
}) {
	const g = props.github;
	const [busy, setBusy] = useState(false);
	if (!g.connected) return <GitHubPill github={g} onChange={props.onChange} />;
	return (
		<div className="stack">
			<div className="row">
				<span>
					<Icon name="github" size={14} /> Signed in as <strong>{g.login}</strong>
					<span className="muted small">
						{" "}
						·{" "}
						{g.source === "pasted"
							? "a pasted token"
							: g.source === "env"
								? "GITHUB_TOKEN"
								: "GitHub sign-in"}
					</span>
				</span>
				{g.source !== "env" && (
					<button
						type="button"
						className="btn btn-outline btn-sm push-right"
						disabled={busy}
						onClick={async () => {
							setBusy(true);
							props.onChange(await api.disconnectGithub());
							setBusy(false);
						}}
					>
						Sign out
					</button>
				)}
			</div>
			{g.installUrl && <ChooseRepos href={g.installUrl} />}
			<p className="muted small">
				{g.source === "env"
					? "Set through GITHUB_TOKEN: unset it to sign out."
					: "Signing out forgets the token on this computer. To withdraw the studio's access on GitHub too: github.com → Settings → Applications."}
			</p>
		</div>
	);
}

/** "Check now", for when automatic updates are off. */
function CheckNow() {
	const [asked, setAsked] = useState(false);
	return (
		<button
			type="button"
			className="btn btn-ghost btn-sm"
			disabled={asked}
			onClick={async () => {
				setAsked(true);
				await desktop?.update?.check();
			}}
		>
			{asked ? "Checked: a new version shows at the top" : "Check for updates now"}
		</button>
	);
}

/** The Figma token: saved to the system keychain, never shown again. */
function FigmaToken() {
	const [status, setStatus] = useState<FigmaTokenStatus | null>(null);
	const [token, setToken] = useState("");
	const [error, setError] = useState("");
	useEffect(() => {
		api.figmaToken().then(setStatus, (e: Error) => setError(e.message));
	}, []);

	const run = async (action: () => Promise<FigmaTokenStatus>) => {
		setError("");
		try {
			setStatus(await action());
			setToken("");
		} catch (e) {
			setError((e as Error).message);
		}
	};

	if (!status) return <p className="muted small">{error || "Checking…"}</p>;
	return (
		<div className="stack">
			<p className="muted small">
				{status.saved
					? "Saved in the system keychain. Figma designs are read through REST."
					: status.env
						? "Set through FIGMA_TOKEN. Figma designs are read through REST."
						: "None yet: Figma is read through your agent's MCP or from an export."}
			</p>
			{status.canSave ? (
				<div className="row">
					<input
						type="password"
						autoComplete="off"
						placeholder="figd_…"
						aria-label="Figma token"
						value={token}
						onChange={(e) => setToken(e.target.value)}
					/>
					<button
						type="button"
						className="btn btn-outline"
						disabled={!token.trim()}
						onClick={() => run(() => api.saveFigmaToken(token))}
					>
						{status.saved ? "Replace" : "Save"}
					</button>
					{status.saved && (
						<button
							type="button"
							className="btn btn-ghost btn-danger"
							onClick={() => run(api.removeFigmaToken)}
						>
							Remove
						</button>
					)}
				</div>
			) : (
				<p className="muted small">To save one here, use the desktop app.</p>
			)}
			<a
				className="small"
				href="https://help.figma.com/hc/en-us/articles/8085703771159"
				target="_blank"
				rel="noreferrer"
			>
				How to create a Figma token <Icon name="external" size={12} />
			</a>
			{error && <p className="error">{error}</p>}
		</div>
	);
}

/** A GitHub token pasted here: GitHub checks it first, then the keychain keeps it. */
function GithubToken(props: { onSaved: (github: Status["github"]) => void }) {
	const [token, setToken] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const save = async () => {
		setBusy(true);
		setError("");
		try {
			props.onSaved(await api.saveGithubToken(token));
			setToken("");
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="stack">
			<p className="muted small">
				A fine-grained token with access to your project repositories (Contents and Pull requests:
				read and write; Issues: read).
			</p>
			<div className="row">
				<input
					type="password"
					autoComplete="off"
					placeholder="github_pat_… or ghp_…"
					aria-label="GitHub token"
					value={token}
					onChange={(e) => setToken(e.target.value)}
				/>
				<button
					type="button"
					className="btn btn-outline"
					disabled={!token.trim() || busy}
					onClick={save}
				>
					{busy ? "Checking…" : "Save"}
				</button>
			</div>
			<a
				className="small"
				href="https://github.com/settings/personal-access-tokens/new"
				target="_blank"
				rel="noreferrer"
			>
				Create a token on GitHub <Icon name="external" size={12} />
			</a>
			{error && <p className="error">{error}</p>}
		</div>
	);
}

/**
 * Connect GitHub is the way in; a pasted token is the fallback for an
 * organization that blocks OAuth Apps until an admin approves them.
 */
function TokenFallback(props: { canSignIn: boolean; onSaved: (g: Status["github"]) => void }) {
	const [open, setOpen] = useState(!props.canSignIn);
	if (!open)
		return (
			<button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
				Use a token instead
			</button>
		);
	return <GithubToken onSaved={props.onSaved} />;
}

/** Settings for the whole studio: GitHub, the Figma token, the engine. */
export type SettingsTab = "settings" | "setup";

export function SettingsDialog(props: {
	status: Status | null;
	/** Which tab opens first: a missing requirement opens Setup. */
	tab: SettingsTab;
	/** Requirements still to fix, shown on the Setup tab. */
	setupIssues: number;
	onGithub: (github: Status["github"]) => void;
	onChecked: (checks: SetupCheck[]) => void;
	onClose: () => void;
}) {
	const { onClose, status } = props;
	const [tab, setTab] = useState(props.tab);
	const [settings, setSettings] = useState<Settings | null>(null);
	useEffect(() => {
		api.settings().then(setSettings, () => setSettings({}));
	}, []);
	const on = (name: SwitchName) => settings?.[name] !== false;
	const flip = async (name: SwitchName, value: boolean) => {
		setSettings(await api.updateSettings({ [name]: value }));
		if (name === "github") props.onGithub((await api.status()).github);
	};
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return createPortal(
		<div className="dialog-backdrop">
			<dialog
				open
				className="dialog panel settings"
				aria-modal="true"
				aria-labelledby="settings-title"
			>
				<span className="eyebrow">
					<Icon name="settings" size={13} /> Settings
				</span>
				<h2 id="settings-title">Studio settings</h2>
				<div className="tabs settings-tabs" role="tablist">
					<button
						type="button"
						role="tab"
						aria-selected={tab === "settings"}
						className={tab === "settings" ? "on" : ""}
						onClick={() => setTab("settings")}
					>
						Settings
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "setup"}
						className={tab === "setup" ? "on" : ""}
						onClick={() => setTab("setup")}
					>
						Setup
						{props.setupIssues > 0 && <span className="side-count bad">{props.setupIssues}</span>}
					</button>
				</div>
				{tab === "setup" && <SetupPanel onChecked={props.onChecked} />}
				{tab === "settings" && (
					<>
						<section className="settings-section">
							<h3>GitHub</h3>
							<Switch
								label="Use GitHub"
								hint="Projects from GitHub, the work board and accepting onto a branch. Off: local folders only, and nothing goes to GitHub; the sign-in stays saved."
								on={on("github")}
								onChange={(v) => flip("github", v)}
							/>
							{!on("github") ? null : status ? (
								<>
									<GithubAccount github={status.github} onChange={props.onGithub} />
									{!status.github.connected && status.github.canSaveToken && (
										<TokenFallback canSignIn={status.github.canSignIn} onSaved={props.onGithub} />
									)}
								</>
							) : (
								<p className="muted small">Checking…</p>
							)}
						</section>
						<section className="settings-section">
							<h3>Figma token</h3>
							<FigmaToken />
						</section>
						{desktop?.update && (
							<section className="settings-section">
								<h3>Updates</h3>
								<Switch
									label="Automatic updates"
									hint="Look for a new version at start and every 4 hours, and download it. Off: only when you check."
									on={on("autoUpdates")}
									onChange={(v) => flip("autoUpdates", v)}
								/>
								{!on("autoUpdates") && <CheckNow />}
							</section>
						)}
						<section className="settings-section">
							<h3>Engine</h3>
							<p className="muted small">
								{status?.eds.ok
									? `aem-eds-kit ${status.eds.version} (needs ${status.eds.min} or newer)`
									: (status?.eds.error ?? "Checking…")}
							</p>
						</section>
					</>
				)}
				<div className="row setup-foot">
					<button type="button" className="btn btn-accent push-right" onClick={onClose}>
						Done
					</button>
				</div>
			</dialog>
		</div>,
		document.body,
	);
}
