import { useEffect, useState } from "react";
import { api, type BlockUsageResult, type Inventory, type Project } from "./api.js";
import { count, notesFor } from "./blockNotes.js";
import { useProjectEvents } from "./Events.js";
import { Icon } from "./Icon.js";

/** The events each block sends: the project's own events, and those found in its code. */
function eventsByBlock(
	uses: Record<string, string[]>,
	found: Inventory["analytics"]["events"],
): Map<string, string[]> {
	const out = new Map<string, string[]>();
	const add = (block: string, event: string) =>
		out.set(block, [...new Set([...(out.get(block) ?? []), event])]);
	for (const [event, blocks] of Object.entries(uses)) for (const b of blocks) add(b, event);
	for (const f of found)
		for (const file of f.files) {
			const block = /^blocks\/([^/]+)\//.exec(file)?.[1];
			if (block) add(block, f.name);
		}
	return out;
}

function since(iso: string | null): string {
	if (!iso) return "–";
	const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
	if (days < 1) return "today";
	if (days < 14) return `${days} ${days === 1 ? "day" : "days"} ago`;
	if (days < 60) return `${Math.round(days / 7)} weeks ago`;
	return `${Math.round(days / 30)} months ago`;
}

const ICON = { unused: "trash", blind: "eye", clicks: "trend", wide: "devices" } as const;

/**
 * The Blocks card's body: what to do about each block first, with the numbers as the
 * reason, and every block's numbers folded below. Reading the site's pages takes a
 * while, so it starts only when the card is opened.
 */
export function BlockUsage(props: {
	project: Project;
	inventory: Inventory;
	load: boolean;
	onAnalytics: (block: string) => void;
}) {
	const { project, load } = props;
	const [usage, setUsage] = useState<BlockUsageResult | null>(null);
	const [error, setError] = useState("");
	const [projectEvents] = useProjectEvents(project.id);
	useEffect(() => {
		if (!load) return;
		api.blockUsage(project.id).then(setUsage, (e: Error) => setError(e.message));
	}, [load, project.id]);

	if (error) return <p className="error small block-usage-note">{error}</p>;
	if (!usage)
		return <p className="muted small block-usage-note">Reading the site's pages and RUM data…</p>;
	const events = eventsByBlock(projectEvents?.uses ?? {}, props.inventory.analytics.events);
	const hasJs = new Set(props.inventory.blocks.filter((b) => b.js).map((b) => b.name));
	const rows = [...usage.blocks].sort(
		(a, b) => (b.views ?? 0) - (a.views ?? 0) || (b.pages ?? 0) - (a.pages ?? 0),
	);
	const todo = rows
		.map((u) => ({ u, notes: notesFor(u, usage.pagesRead, events.get(u.name) ?? []) }))
		.filter((r) => r.notes.length);
	const fine = rows.filter((u) => !todo.some((t) => t.u.name === u.name)).map((u) => u.name);

	return (
		<div className="block-usage">
			<p className="muted small block-usage-note">
				{usage.site ? `${usage.pagesRead} pages read` : "The site's pages couldn't be read"}
				{usage.days
					? `, RUM for the last ${usage.days} days (sampled, so views are an estimate).`
					: project.rumDomain
						? ". Add the RUM key in Performance for views and clicks."
						: ". Set the site's domain and RUM key in Performance for views and clicks."}
			</p>
			<ul className="overview-blocks block-todo">
				{todo.map(({ u, notes }) => (
					<li key={u.name}>
						<Icon name={ICON[notes[0].kind]} size={14} />
						<code>{u.name}</code>
						<span className={`small ${notes[0].kind === "unused" ? "poor" : "muted"}`}>
							{notes.map((n) => n.text).join(" · ")}
						</span>
						{notes.some((n) => n.kind === "blind") && hasJs.has(u.name) && (
							<button
								type="button"
								className="btn btn-ghost btn-sm push-right"
								onClick={() => props.onAnalytics(u.name)}
							>
								Add analytics
							</button>
						)}
					</li>
				))}
				{fine.length > 0 && (
					<li>
						<Icon name="check" size={14} />
						<span className="muted small">{fine.join(", ")}: nothing to do</span>
					</li>
				)}
			</ul>
			<details className="block-all">
				<summary className="muted small">All blocks</summary>
				<div className="block-table-wrap">
					<table className="block-table">
						<thead>
							<tr>
								<th>Block</th>
								<th className="num">Pages</th>
								<th className="num">Views</th>
								<th className="num">Click rate</th>
								<th>Event</th>
								<th>Last change</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{rows.map((u) => (
								<tr key={u.name}>
									<td>
										<code>{u.name}</code>
									</td>
									<td className="num">{u.pages ?? "–"}</td>
									<td className="num">{u.views === null ? "–" : count(u.views)}</td>
									<td className="num">
										{u.clickRate === null ? "–" : `${(u.clickRate * 100).toFixed(1)}%`}
									</td>
									<td className="mono small">{events.get(u.name)?.join(", ") || "–"}</td>
									<td className="muted small">{since(u.lastChange)}</td>
									<td>
										{hasJs.has(u.name) && (
											<button
												type="button"
												className="btn btn-ghost btn-sm"
												onClick={() => props.onAnalytics(u.name)}
											>
												<Icon name="usage" size={13} /> Analytics
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</details>
		</div>
	);
}
