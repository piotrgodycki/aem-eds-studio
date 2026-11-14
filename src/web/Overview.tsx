import { useCallback, useEffect, useState } from "react";
import { api, type Found, type Inventory, type Project } from "./api.js";
import { BlockAnalytics } from "./BlockAnalytics.js";
import { Icon } from "./Icon.js";

/**
 * The Overview tab: what the project already has, from `eds inspect`. Each
 * finding opens to the files it was found in.
 */
export function Overview(props: { project: Project }) {
	const projectId = props.project.id;
	const [inv, setInv] = useState<Inventory | null>(null);
	const [tracking, setTracking] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const read = useCallback(async () => {
		setBusy(true);
		setError("");
		try {
			setInv(await api.inventory(projectId));
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}, [projectId]);
	useEffect(() => {
		void read();
	}, [read]);

	if (!inv) return <p className="muted">{error || "Reading the project…"}</p>;
	const a = inv.analytics;
	return (
		<div className="overview">
			<div className="overview-head">
				<div className="overview-facts">
					<Fact
						label="Kind"
						value={inv.kind === "universal-editor" ? "Universal Editor" : "Document-based"}
					/>
					<Fact
						label="Content"
						value={inv.content?.source ?? "No fstab.yaml"}
						title={inv.content?.url}
					/>
					<Fact label="Blocks" value={String(inv.blocks.length)} />
					{inv.kind === "universal-editor" && (
						<Fact
							label="UE"
							value={`${inv.components.definitions} components · ${inv.components.models} models`}
						/>
					)}
					<Fact
						label="Styles"
						value={`${inv.styles.tokens} tokens${inv.styles.fonts.length ? ` · ${inv.styles.fonts.join(", ")}` : ""}`}
					/>
				</div>
				<button
					type="button"
					className="btn btn-ghost btn-sm"
					disabled={busy}
					onClick={() => void read()}
				>
					<Icon name="history" size={14} /> {busy ? "Reading…" : "Refresh"}
				</button>
			</div>
			{error && <p className="error small">{error}</p>}

			<Section title="Blocks" count={inv.blocks.length}>
				<ul className="overview-blocks">
					{inv.blocks.map((b) => (
						<li key={b.name}>
							<code>{b.name}</code>
							<span className="muted small">
								{[b.js && "JS", b.css && "CSS", b.model && "UE model", b.preview && "preview"]
									.filter(Boolean)
									.join(" · ")}
							</span>
							{b.js && (
								<button
									type="button"
									className="btn btn-ghost btn-sm push-right"
									onClick={() => setTracking(b.name)}
								>
									<Icon name="usage" size={13} /> Analytics
								</button>
							)}
						</li>
					))}
				</ul>
			</Section>
			<Findings title="Third parties" list={inv.thirdParties} />
			<Findings title="Data layer" list={a.dataLayer} />
			<Findings title="Tag IDs" list={a.ids} />
			<Findings title="Page metadata read" list={a.metadata} />
			<Findings title="Custom events" list={a.events} />
			<Findings title="RUM checkpoints" list={a.rum} />
			<Findings title="Setup" list={inv.setup} />
			{tracking && (
				<BlockAnalytics
					project={props.project}
					block={tracking}
					onClose={() => setTracking(null)}
				/>
			)}
		</div>
	);
}

function Fact(props: { label: string; value: string; title?: string }) {
	return (
		<div className="overview-fact" title={props.title}>
			<span className="muted small">{props.label}</span>
			<strong>{props.value}</strong>
		</div>
	);
}

function Section(props: { title: string; count: number; children: React.ReactNode }) {
	return (
		<section className="overview-section">
			<h3>
				{props.title} <span className="count">{props.count}</span>
			</h3>
			{props.children}
		</section>
	);
}

/** A list of findings; each one opens to the files it was found in. */
function Findings(props: { title: string; list: Found[] }) {
	if (!props.list.length) return null;
	return (
		<Section title={props.title} count={props.list.length}>
			<ul className="overview-findings">
				{props.list.map((f) => (
					<li key={f.name}>
						<details>
							<summary>
								{f.name}
								<span className="muted small">
									{f.files.length === 1 ? f.files[0] : `${f.files.length} files`}
								</span>
							</summary>
							{f.files.length > 1 && (
								<ul className="overview-files mono small">
									{f.files.map((file) => (
										<li key={file}>{file}</li>
									))}
								</ul>
							)}
						</details>
					</li>
				))}
			</ul>
		</Section>
	);
}
