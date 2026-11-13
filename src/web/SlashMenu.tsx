import { type KeyboardEvent, useState } from "react";
import { Icon } from "./Icon.js";

/**
 * Slash commands in the message box: typing "/" at the start lists them,
 * filtered as you type; the arrows move, Enter or Tab runs one, Escape closes.
 */

export interface SlashCommand {
	name: string;
	hint: string;
	icon: Parameters<typeof Icon>[0]["name"];
	run: () => void;
}

export function useSlash(text: string, commands: SlashCommand[], clear: () => void) {
	const [index, setIndex] = useState(0);
	const [closedFor, setClosedFor] = useState<string | null>(null);
	const query = /^\/(\S*)$/.exec(text)?.[1];
	const items =
		query === undefined || closedFor === text
			? []
			: commands.filter((c) => c.name.startsWith(query.toLowerCase()));
	const at = Math.min(index, Math.max(items.length - 1, 0));

	const pick = (c: SlashCommand) => {
		clear();
		setIndex(0);
		c.run();
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

	const menu = items.length ? (
		<ul className="composer-menu" aria-label="Commands">
			{items.map((c, i) => (
				<li key={c.name}>
					<button
						type="button"
						className={i === at ? "on" : ""}
						aria-current={i === at}
						onMouseEnter={() => setIndex(i)}
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => pick(c)}
					>
						<Icon name={c.icon} size={15} />
						<span className="mono">/{c.name}</span>
						<span className="muted">{c.hint}</span>
					</button>
				</li>
			))}
		</ul>
	) : null;
	return { menu, onKeyDown };
}
