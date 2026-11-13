import { type KeyboardEvent, useEffect, useState } from "react";
import { jobTitle } from "./Agents.js";
import { api } from "./api.js";
import { Icon } from "./Icon.js";

/**
 * `@` in the message box: point at a draft, a block, an issue or pull request
 * from the work board, or a piece of agent work. Typing `@` lists them, filtered
 * as you type; the arrows move, Enter or Tab picks one, Escape closes. A pick
 * goes along with the message as a chip, like a dragged pull request.
 */

export type Mention =
	| { kind: "draft"; name: string }
	| { kind: "block"; name: string }
	| { kind: "issue"; number: number; title: string }
	| { kind: "pull"; number: number; title: string }
	| { kind: "job"; id: string; title: string };

interface Item {
	mention: Mention;
	label: string;
	hint: string;
	icon: Parameters<typeof Icon>[0]["name"];
}

const SHOWN = 8;
/** The `@word` being typed at the end of the message. */
const AT = /(^|\s)@([\w-]*)$/;

async function candidates(projectId: string): Promise<Item[]> {
	const [drafts, blocks, board, jobs] = await Promise.allSettled([
		api.drafts(projectId),
		api.blocks(projectId),
		api.board(projectId),
		api.jobs(projectId),
	]);
	const items: Item[] = [];
	if (drafts.status === "fulfilled")
		for (const d of drafts.value.filter((x) => x.status === "open"))
			items.push({
				mention: { kind: "draft", name: d.name },
				label: d.name,
				hint: `draft · v${d.versions.at(-1)?.version ?? 1}`,
				icon: "desktop",
			});
	if (blocks.status === "fulfilled")
		for (const name of blocks.value)
			items.push({ mention: { kind: "block", name }, label: name, hint: "block", icon: "design" });
	if (board.status === "fulfilled")
		for (const c of board.value.cards.filter((x) => x.column !== "done"))
			items.push({
				mention:
					c.kind === "pr"
						? { kind: "pull", number: c.number, title: c.title }
						: { kind: "issue", number: c.number, title: c.title },
				label: `#${c.number} ${c.title}`,
				hint: c.kind === "pr" ? "pull request" : "issue",
				icon: c.kind === "pr" ? "branch" : "github",
			});
	if (jobs.status === "fulfilled")
		for (const j of jobs.value.filter((x) => !["preview", "list", "agents"].includes(x.kind)))
			items.push({
				mention: { kind: "job", id: j.id, title: jobTitle(j) },
				label: jobTitle(j),
				hint: `agent work · ${j.status}`,
				icon: "agent",
			});
	return items;
}

export function useMentions(
	projectId: string,
	text: string,
	setText: (t: string) => void,
	onPick: (m: Mention) => void,
) {
	const query = AT.exec(text)?.[2];
	const open = query !== undefined;
	const [all, setAll] = useState<Item[] | null>(null);
	const [index, setIndex] = useState(0);
	const [closedFor, setClosedFor] = useState<string | null>(null);
	// The lists load when `@` is first typed, then stay for this message box.
	useEffect(() => {
		if (open && !all) void candidates(projectId).then(setAll);
	}, [open, all, projectId]);

	const q = (query ?? "").toLowerCase();
	const items =
		!open || closedFor === text
			? []
			: (all ?? []).filter((i) => i.label.toLowerCase().includes(q)).slice(0, SHOWN);
	const at = Math.min(index, Math.max(items.length - 1, 0));

	const pick = (i: Item) => {
		setText(text.replace(AT, "$1"));
		setIndex(0);
		onPick(i.mention);
	};
	/** Handles the key when the list is open; true when it did. */
	const onKeyDown = (e: KeyboardEvent): boolean => {
		if (!items.length) return false;
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			setIndex((at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
			return true;
		}
		if (e.key === "Enter" || e.key === "Tab") {
			e.preventDefault();
			pick(items[at]);
			return true;
		}
		if (e.key === "Escape") {
			setClosedFor(text);
			return true;
		}
		return false;
	};

	const menu =
		open && closedFor !== text ? (
			<ul className="composer-menu" aria-label="Point at">
				{!all && <li className="plus-tip muted small">Looking…</li>}
				{all && items.length === 0 && (
					<li className="plus-tip muted small">Nothing called “{query}”.</li>
				)}
				{items.map((i, n) => (
					<li key={`${i.mention.kind}-${i.label}`}>
						<button
							type="button"
							className={n === at ? "on" : ""}
							aria-current={n === at}
							onMouseEnter={() => setIndex(n)}
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => pick(i)}
						>
							<Icon name={i.icon} size={15} />
							<span className="mention-label">{i.label}</span>
							<span className="muted">{i.hint}</span>
						</button>
					</li>
				))}
			</ul>
		) : null;
	return { menu, onKeyDown };
}
