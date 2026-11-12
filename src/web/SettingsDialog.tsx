import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, type FigmaTokenStatus, type Status } from "./api.js";
import { GitHubPill } from "./GitHubConnect.js";
import { Icon } from "./Icon.js";

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
				Paste a token, or sign in with the GitHub CLI (<code>gh auth login</code>).
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

/** Settings for the whole studio: GitHub, the Figma token, the engine. */
export function SettingsDialog(props: {
	status: Status | null;
	onGithub: (github: Status["github"]) => void;
	onClose: () => void;
}) {
	const { onClose, status } = props;
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
				<section className="settings-section">
					<h3>GitHub</h3>
					{status ? (
						<>
							<GitHubPill github={status.github} onChange={props.onGithub} />
							{!status.github.connected && status.github.canSaveToken && (
								<GithubToken onSaved={props.onGithub} />
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
				<section className="settings-section">
					<h3>Engine</h3>
					<p className="muted small">
						{status?.eds.ok
							? `aem-eds-kit ${status.eds.version} (needs ${status.eds.min} or newer)`
							: (status?.eds.error ?? "Checking…")}
					</p>
				</section>
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
