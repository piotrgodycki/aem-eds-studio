import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, type Project, type Ticket, type TrackChoice } from "./api.js";
import { Icon } from "./Icon.js";
import { href } from "./router.js";
import { TicketField, usesTickets } from "./TicketField.js";

const LAYERS = ["dataLayer", "adobeDataLayer"];

/**
 * Pick a block's analytics by clicking: what to track and under which event
 * names, where it goes, and whether other scripts hear it too. It becomes the
 * draft's next version (eds track block --draft), reviewed like any change.
 */
export function BlockAnalytics(props: { project: Project; block: string; onClose: () => void }) {
	const { project, block, onClose } = props;
	// Event names read like analytics names: apex-hero → apex_hero_click.
	const base = block.replace(/-/g, "_");
	const [click, setClick] = useState({ on: true, name: `${base}_click` });
	const [submit, setSubmit] = useState({ on: false, name: "form_submit" });
	const [view, setView] = useState({ on: true, name: `${base}_view` });
	const [layers, setLayers] = useState<string[]>(["dataLayer"]);
	const [custom, setCustom] = useState("");
	const [dispatch, setDispatch] = useState(false);
	const [ticket, setTicket] = useState<Ticket>({ type: "feature", number: "" });
	const [askTicket, setAskTicket] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const chosenLayers = [...layers, ...(custom.trim() ? [custom.trim()] : [])];
	const choice: TrackChoice = {
		click: click.on ? click.name : null,
		submit: submit.on ? submit.name : null,
		view: view.on ? view.name : null,
		layers: chosenLayers,
		dispatch,
	};
	const nothing = !choice.click && !choice.submit && !choice.view;
	const run = async () => {
		setBusy(true);
		setError("");
		try {
			await api.trackBlock(project.id, block, { ...choice, ...(askTicket ? { ticket } : {}) });
			window.location.hash = href.draft(project.id, block);
			onClose();
		} catch (e) {
			// A block with no draft yet starts one: in a project with ticket branches, ask for it.
			if ((e as { ticket?: boolean }).ticket && !askTicket) setAskTicket(true);
			else setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	const event = (
		label: string,
		value: { on: boolean; name: string },
		set: (v: { on: boolean; name: string }) => void,
	) => (
		<div className="track-row">
			<label className="check">
				<input
					type="checkbox"
					checked={value.on}
					onChange={(e) => set({ ...value, on: e.target.checked })}
				/>
				{label}
			</label>
			<input
				className="mono"
				aria-label={`${label} event name`}
				value={value.name}
				disabled={!value.on}
				onChange={(e) => set({ ...value, name: e.target.value.replace(/[^\w:.-]/g, "") })}
			/>
		</div>
	);

	return createPortal(
		<div className="dialog-backdrop">
			<dialog
				open
				className="dialog panel settings"
				aria-modal="true"
				aria-labelledby="track-title"
			>
				<span className="eyebrow">
					<Icon name="usage" size={13} /> Analytics
				</span>
				<h2 id="track-title">
					Track <code>{block}</code>
				</h2>
				<section className="settings-section">
					<h3>Events</h3>
					{event("Clicks on links and buttons", click, setClick)}
					{event("Form submits", submit, setSubmit)}
					{event("Comes into view", view, setView)}
				</section>
				<section className="settings-section">
					<h3>Sent to</h3>
					<div className="row track-layers">
						{LAYERS.map((l) => (
							<label key={l} className="check mono">
								<input
									type="checkbox"
									checked={layers.includes(l)}
									onChange={(e) =>
										setLayers(e.target.checked ? [...layers, l] : layers.filter((x) => x !== l))
									}
								/>
								{l}
							</label>
						))}
						<input
							className="mono"
							aria-label="Another data layer"
							placeholder="other layer"
							value={custom}
							onChange={(e) => setCustom(e.target.value.replace(/[^\w$]/g, ""))}
						/>
					</div>
					{!chosenLayers.length && (
						<p className="muted small">
							None picked: events go through trackEvent in scripts/analytics.js (GTM).
						</p>
					)}
					<label className="check">
						<input
							type="checkbox"
							checked={dispatch}
							onChange={(e) => setDispatch(e.target.checked)}
						/>
						Also as DOM events other scripts can listen to
					</label>
				</section>
				{askTicket && project.ticketKey && usesTickets(project) && (
					<section className="settings-section">
						<h3>Ticket</h3>
						<TicketField ticketKey={project.ticketKey} value={ticket} onChange={setTicket} />
					</section>
				)}
				<p className="muted small">
					It becomes the draft's next version: you review it, then accept it into a pull request.
				</p>
				{error && <p className="error small">{error}</p>}
				<div className="row setup-foot">
					<button type="button" className="btn btn-ghost" onClick={onClose}>
						Cancel
					</button>
					<button
						type="button"
						className="btn btn-accent push-right"
						disabled={busy || nothing || (askTicket && !ticket.number)}
						onClick={() => void run()}
					>
						{busy ? "Starting…" : "Make the next version"}
					</button>
				</div>
			</dialog>
		</div>,
		document.body,
	);
}
