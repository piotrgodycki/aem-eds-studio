import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Icon } from "./Icon.js";

/**
 * The studio's own "are you sure?", in its look rather than the browser's grey
 * box: a short question, one line on what happens, the item's name, and a red
 * action. `confirmAction` shows it and resolves true only on the action.
 */

export interface ConfirmOptions {
	/** A short question, e.g. "Delete this thread?" */
	title: string;
	/** What happens, in one sentence. */
	detail: string;
	/** The thing it acts on, shown small under the question. */
	item?: string;
	/** The red button's label, e.g. "Delete". */
	action: string;
	icon?: Parameters<typeof Icon>[0]["name"];
}

function ConfirmDialog(props: ConfirmOptions & { onDone: (ok: boolean) => void }) {
	const { onDone } = props;
	// Focus starts on Cancel, so Enter never deletes by accident.
	const cancel = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		cancel.current?.focus();
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone(false);
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onDone]);
	return (
		<div className="dialog-backdrop">
			<dialog
				open
				className="dialog panel confirm"
				aria-modal="true"
				aria-labelledby="confirm-title"
				aria-describedby="confirm-detail"
			>
				<span className="confirm-icon" aria-hidden="true">
					<Icon name={props.icon ?? "trash"} size={20} />
				</span>
				<h2 id="confirm-title">{props.title}</h2>
				{props.item && <p className="confirm-item">{props.item}</p>}
				<p id="confirm-detail" className="muted">
					{props.detail}
				</p>
				<div className="row confirm-actions">
					<button
						ref={cancel}
						type="button"
						className="btn btn-ghost"
						onClick={() => onDone(false)}
					>
						Cancel
					</button>
					<button type="button" className="btn btn-bad" onClick={() => onDone(true)}>
						{props.action}
					</button>
				</div>
			</dialog>
		</div>
	);
}

/** Ask before something that can't be undone; true when the user chose the action. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
	return new Promise((resolve) => {
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		const done = (ok: boolean) => {
			root.unmount();
			host.remove();
			resolve(ok);
		};
		root.render(<ConfirmDialog {...options} onDone={done} />);
	});
}
