import { type RefObject, useEffect } from "react";

/** Close a menu or popover on a click outside it, or on Escape. */
export function useOutside(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
	useEffect(() => {
		if (!open) return;
		const onDown = (e: Event) => {
			if (
				e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)
			)
				close();
		};
		window.addEventListener("mousedown", onDown);
		window.addEventListener("keydown", onDown);
		return () => {
			window.removeEventListener("mousedown", onDown);
			window.removeEventListener("keydown", onDown);
		};
	}, [ref, open, close]);
}
