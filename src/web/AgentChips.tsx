import { useEffect, useRef, useState } from "react";
import type { Agent, ModelChoice } from "./api.js";
import { Icon } from "./Icon.js";
import { AGENTS, useAgentStatuses } from "./ModelPicker.js";

/**
 * The agent and model for the next message, as two small chips in the message
 * box. The agent chip names the agent that will answer; its menu lists only
 * the agents installed here that the studio can keep inside the project. The
 * model chip appears once an agent is picked.
 */

type Menu = "agent" | "model" | null;

function useOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
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

export function AgentChips(props: {
	value: ModelChoice;
	onChange: (v: ModelChoice) => void;
	/** The project's default agent, if it has one. */
	projectAgent?: Agent;
	/** Changes when something else (the /agent command) asks to open the agent menu. */
	openSignal?: number;
}) {
	const { value, onChange } = props;
	const statuses = useAgentStatuses();
	const [menu, setMenu] = useState<Menu>(null);
	const [typed, setTyped] = useState("");
	const box = useRef<HTMLDivElement>(null);
	const close = () => setMenu(null);
	useOutside(box, menu !== null, close);
	useEffect(() => {
		if (props.openSignal) setMenu("agent");
	}, [props.openSignal]);

	const usable = (statuses ?? [])
		.filter((s) => s.installed && s.confined)
		.map((s) => s.type as Agent);
	// Who answers: the thread's pick, else the project's, else the first one eds would detect.
	const current = value.agent ?? props.projectAgent ?? usable[0];
	const info = AGENTS.find((a) => a.id === current);
	const picked = !!value.agent;
	const modelLabel =
		info?.models?.find((m) => m.id === value.model)?.label ?? value.model ?? "Model";

	return (
		<div className="agent-chips" ref={box}>
			<button
				type="button"
				className={`chip-btn${menu === "agent" ? " on" : ""}`}
				aria-expanded={menu === "agent"}
				title="The agent that answers the next message"
				onClick={() => setMenu(menu === "agent" ? null : "agent")}
			>
				{info?.label ?? (statuses ? "No agent" : "…")}
				<Icon name="chevron" size={12} />
			</button>
			{picked && (
				<button
					type="button"
					className={`chip-btn${menu === "model" ? " on" : ""}`}
					aria-expanded={menu === "model"}
					onClick={() => {
						setTyped(value.model ?? "");
						setMenu(menu === "model" ? null : "model");
					}}
				>
					{modelLabel}
					<Icon name="chevron" size={12} />
				</button>
			)}
			{menu === "agent" && (
				<ul className="composer-menu chip-menu">
					{usable.length === 0 && (
						<li className="plus-tip muted small">
							No agent the studio can keep inside the project. See Settings → Setup.
						</li>
					)}
					{usable.map((id) => (
						<li key={id}>
							<button
								type="button"
								className={id === current ? "on" : ""}
								onClick={() => {
									onChange({ agent: id, model: id === value.agent ? value.model : undefined });
									close();
								}}
							>
								<span>{AGENTS.find((a) => a.id === id)?.label ?? id}</span>
								{id === current && <Icon name="check" size={14} />}
							</button>
						</li>
					))}
				</ul>
			)}
			{menu === "model" && info && (
				<ul className="composer-menu chip-menu">
					{info.models ? (
						[{ id: "", label: "Default model" }, ...info.models].map((m) => (
							<li key={m.id || "default"}>
								<button
									type="button"
									className={(value.model ?? "") === m.id ? "on" : ""}
									onClick={() => {
										onChange({ ...value, model: m.id || undefined });
										close();
									}}
								>
									<span>{m.label}</span>
									{(value.model ?? "") === m.id && <Icon name="check" size={14} />}
								</button>
							</li>
						))
					) : (
						<li className="chip-model-field">
							<input
								// biome-ignore lint/a11y/noAutofocus: the menu opened to type a model
								autoFocus
								value={typed}
								placeholder={info.hint}
								aria-label="Model"
								onChange={(e) => setTyped(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										onChange({ ...value, model: typed.trim() || undefined });
										close();
									}
								}}
							/>
						</li>
					)}
				</ul>
			)}
		</div>
	);
}
