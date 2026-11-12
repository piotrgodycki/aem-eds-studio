import { useEffect, useId, useState } from "react";
import { type Agent, type AgentStatus, api, type ModelChoice } from "./api.js";

const AGENTS: Array<{ id: Agent; label: string; models?: string[]; hint: string }> = [
	{
		id: "claude",
		label: "Claude Code",
		models: ["haiku", "sonnet", "opus"],
		hint: "haiku is fastest",
	},
	{ id: "cursor", label: "Cursor", hint: "the model set in Cursor" },
	{ id: "codex", label: "Codex", hint: "the model set in Codex" },
	{ id: "ollama", label: "Ollama (local)", hint: "e.g. qwen2.5-coder:14b" },
	{ id: "omlx", label: "oMLX (local)", hint: "a model loaded in oMLX" },
	{ id: "local", label: "OpenAI-compatible server", hint: "the server's model id" },
];

let agentList: Promise<AgentStatus[]> | undefined;

/** Which agents stay inside the project (`eds agents`), asked once per app run. */
function useConfined(): Partial<Record<Agent, boolean>> {
	const [confined, setConfined] = useState<Partial<Record<Agent, boolean>>>({});
	useEffect(() => {
		agentList ??= api.agents().catch((err) => {
			agentList = undefined; // ask again next time
			throw err;
		});
		agentList.then(
			(list) => setConfined(Object.fromEntries(list.map((a) => [a.type, a.confined]))),
			() => {},
		);
	}, []);
	return confined;
}

/** Agent + model. Empty means "the project's default" (or what the CLI detects). */
export function ModelPicker(props: {
	value: ModelChoice;
	onChange: (v: ModelChoice) => void;
	defaultLabel?: string;
}) {
	const { value, onChange } = props;
	const agent = AGENTS.find((a) => a.id === value.agent);
	const modelId = useId();
	const confined = useConfined();
	const outside = (id: Agent) => confined[id] === false;
	return (
		<>
			<div className="row model-picker">
				<label className="field">
					<span>Agent</span>
					<select
						value={value.agent ?? ""}
						onChange={(e) =>
							onChange({
								agent: (e.target.value || undefined) as Agent | undefined,
								model: undefined,
							})
						}
					>
						<option value="">{props.defaultLabel ?? "Default (detected)"}</option>
						{AGENTS.map((a) => (
							<option key={a.id} value={a.id}>
								{a.label}
								{outside(a.id) ? " · reads outside the project" : ""}
							</option>
						))}
					</select>
				</label>
				<div className="field">
					<label htmlFor={modelId}>Model</label>
					{agent?.models ? (
						<select
							id={modelId}
							value={value.model ?? ""}
							onChange={(e) => onChange({ ...value, model: e.target.value || undefined })}
						>
							<option value="">Default</option>
							{agent.models.map((m) => (
								<option key={m} value={m}>
									{m}
								</option>
							))}
						</select>
					) : (
						<input
							id={modelId}
							value={value.model ?? ""}
							placeholder={agent?.hint ?? "Default"}
							disabled={!value.agent}
							onChange={(e) => onChange({ ...value, model: e.target.value || undefined })}
						/>
					)}
				</div>
			</div>
			{agent && outside(agent.id) && (
				<p className="agent-warning small">
					{agent.label} can read any file on this computer, not only this project. Claude Code or a
					local model stays inside the project.
				</p>
			)}
		</>
	);
}
