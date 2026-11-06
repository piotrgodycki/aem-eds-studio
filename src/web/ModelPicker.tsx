import { useId } from "react";
import type { Agent, ModelChoice } from "./api.js";

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

/** Agent + model. Empty means "the project's default" (or what the CLI detects). */
export function ModelPicker(props: {
	value: ModelChoice;
	onChange: (v: ModelChoice) => void;
	defaultLabel?: string;
}) {
	const { value, onChange } = props;
	const agent = AGENTS.find((a) => a.id === value.agent);
	const modelId = useId();
	return (
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
	);
}
