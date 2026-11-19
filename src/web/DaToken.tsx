import { useEffect, useState } from "react";
import { api, type Project, type TokenStatus } from "./api.js";
import { Hidden } from "./Performance.js";

/**
 * The project's DA (da.live) token, for changing its pages from the chat. It is
 * kept in the keychain on the studio's computer and never comes back to the page.
 */
export function DaTokenSetting(props: { project: Project }) {
	const [state, setState] = useState<TokenStatus | null>(null);
	const [token, setToken] = useState("");
	const [error, setError] = useState("");
	const [saved, setSaved] = useState(false);
	useEffect(() => {
		api.daToken(props.project.id).then(setState, () => setState(null));
	}, [props.project.id]);
	if (!state) return null;
	return (
		<section className="settings-section">
			<h3>DA token</h3>
			<p className="muted small">
				For changing the site's pages from the chat: the agent proposes a change, you accept it, and
				the studio writes the page in DA. Kept in the keychain.
			</p>
			{state.canSave ? (
				<form
					className="row"
					onSubmit={async (e) => {
						e.preventDefault();
						setError("");
						setSaved(false);
						try {
							setState(await api.saveDaToken(props.project.id, token));
							setToken("");
							setSaved(true);
						} catch (err) {
							setError((err as Error).message);
						}
					}}
				>
					<Hidden
						label="DA token"
						placeholder={state.saved ? "Token saved" : "DA token"}
						value={token}
						onChange={setToken}
					/>
					<button type="submit" className="btn btn-accent btn-sm" disabled={!token}>
						Save
					</button>
					{state.saved && (
						<button
							type="button"
							className="btn btn-ghost btn-sm"
							onClick={async () => setState(await api.clearDaToken(props.project.id))}
						>
							Remove
						</button>
					)}
					{saved && <span className="muted small">Saved.</span>}
				</form>
			) : (
				<p className="muted small">
					{state.env ? "The token comes from DA_TOKEN." : "Set DA_TOKEN where the studio runs."}
				</p>
			)}
			{error && <p className="error small">{error}</p>}
		</section>
	);
}
