import { useEffect, useState } from "react";
import { Icon } from "./Icon.js";
import { type UpdateState, desktop } from "./api.js";

/** The desktop app's update, in the header: downloading, then "Restart to update". */
export function UpdatePill() {
	const [u, setU] = useState<UpdateState | null>(null);
	useEffect(() => {
		const bridge = desktop?.update;
		if (!bridge) return;
		void bridge.state().then(setU);
		return bridge.onChange(setU);
	}, []);
	if (!u || !desktop?.update) return null;

	if (u.state === "downloading")
		return (
			<span className="pill" title={`Downloading version ${u.version ?? ""}`}>
				<span className="dot dot-running" />
				Update {u.percent !== undefined ? `${u.percent}%` : "…"}
			</span>
		);
	if (u.state === "ready" || u.state === "available")
		return (
			<button
				type="button"
				className="pill pill-update"
				aria-label={u.inPlace ? `Restart to update to ${u.version}` : `Download ${u.version}`}
				title={
					u.inPlace
						? "The update is downloaded; the app restarts on the new version"
						: "Download the new version (this build can't replace itself until it's signed)"
				}
				onClick={() => void desktop?.update?.install()}
			>
				<Icon name={u.inPlace ? "check" : "download"} size={14} />
				{u.inPlace ? "Restart to update" : "Download"}
				<span className="pill-long"> {u.inPlace ? `to ${u.version}` : u.version}</span>
			</button>
		);
	return null;
}
