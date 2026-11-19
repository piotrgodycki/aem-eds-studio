import { useEffect, useRef, useState } from "react";
import { api, type ContentProposal, type Project } from "./api.js";
import { Icon } from "./Icon.js";

/**
 * A page change the chat's agent proposes, for a content author: "Show the
 * change" has the agent make it (nothing is written yet), the sections that
 * differ show before and after, Accept writes the page to DA and previews it,
 * and Publish puts it live. Each step waits for the person.
 */
export function ContentChange(props: {
	project: Project;
	path: string;
	change: string;
	/** The talk moved on: shown greyed, with nothing to press. */
	past?: boolean;
	/** Accepted in words: show the change at once. */
	confirmed?: boolean;
}) {
	const { project, path } = props;
	const [step, setStep] = useState<"" | "proposing" | "saving" | "publishing">("");
	const [proposal, setProposal] = useState<ContentProposal | null>(null);
	const [preview, setPreview] = useState<string | null | undefined>(undefined);
	const [live, setLive] = useState<string | null>(null);
	const [discarded, setDiscarded] = useState(false);
	const [error, setError] = useState("");
	const run = async (what: typeof step, fn: () => Promise<void>) => {
		setStep(what);
		setError("");
		try {
			await fn();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setStep("");
		}
	};
	const propose = () =>
		run("proposing", async () =>
			setProposal(await api.proposeContent(project.id, path, props.change)),
		);
	// A yes in words shows the change once, as the check would.
	const asked = useRef(false);
	useEffect(() => {
		if (!props.confirmed || asked.current) return;
		asked.current = true;
		void propose();
	});

	return (
		<div className={`action-bubble content-change${props.past ? " past" : ""}`}>
			<div className="action-head">
				<span className="action-mark" aria-hidden="true">
					<Icon name="pencil" size={16} />
				</span>
				<span className="action-what">
					<strong>
						Change the page <code>{path}</code>
					</strong>
					<span className="muted small">“{props.change}”</span>
				</span>
				{!proposal && !props.past && (
					<button
						type="button"
						className="btn btn-outline btn-sm"
						disabled={step !== ""}
						onClick={() => void propose()}
					>
						<Icon name="eye" size={14} />{" "}
						{step === "proposing" ? "The agent is changing it…" : "Show the change"}
					</button>
				)}
			</div>
			{proposal && !discarded && (
				<div className="content-diff">
					{proposal.note && <p className="small">{proposal.note}</p>}
					{proposal.sections.length === 0 && (
						<p className="muted small">The agent changed no words on the page.</p>
					)}
					{proposal.sections.map((s) => (
						<div key={s.section} className="content-section">
							<span className="muted small">Section {s.section}</span>
							<p className="content-before small">
								<span className="muted">Before</span> <s>{s.before || "(none)"}</s>
							</p>
							<p className="content-after small">
								<span className="muted">After</span> {s.after || "(removed)"}
							</p>
						</div>
					))}
					{preview === undefined ? (
						<div className="row">
							<button
								type="button"
								className="btn btn-ghost btn-sm"
								disabled={step !== ""}
								onClick={() => setDiscarded(true)}
							>
								Discard
							</button>
							<button
								type="button"
								className="btn btn-accent btn-sm push-right"
								disabled={step !== "" || !proposal.sections.length}
								onClick={() =>
									void run("saving", async () =>
										setPreview((await api.saveContent(project.id, path, proposal.file)).preview),
									)
								}
							>
								<Icon name="check" size={14} />{" "}
								{step === "saving" ? "Saving…" : "Accept and preview"}
							</button>
						</div>
					) : (
						<div className="row">
							{preview ? (
								<a href={preview} target="_blank" rel="noreferrer" className="small">
									Preview {path} ↗
								</a>
							) : (
								<span className="muted small">
									Saved in DA. The preview didn't run, so preview it in DA.
								</span>
							)}
							{live ? (
								<a href={live} target="_blank" rel="noreferrer" className="small push-right">
									Live ↗
								</a>
							) : (
								<button
									type="button"
									className="btn btn-outline btn-sm push-right"
									disabled={step !== ""}
									onClick={() =>
										void run("publishing", async () =>
											setLive((await api.publishContent(project.id, path)).live),
										)
									}
								>
									{step === "publishing" ? "Publishing…" : "Publish"}
								</button>
							)}
						</div>
					)}
				</div>
			)}
			{discarded && <p className="muted small">Discarded. The page stays as it was.</p>}
			{error && <p className="error small">{error}</p>}
		</div>
	);
}
