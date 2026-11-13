import { useEffect, useId, useState } from "react";
import { type Agent, type AgentStatus, api, type ModelChoice } from "./api.js";

/**
 * Claude Code takes an alias and runs the latest model of that name for the
 * signed-in account. It doesn't tell other programs which ones a plan
 * includes, so all are listed; one the plan lacks is refused by Claude Code.
 */
export const CLAUDE_MODELS = [
	{ id: "fable", label: "Fable" },
	{ id: "opus", label: "Opus" },
	{ id: "sonnet", label: "Sonnet" },
	{ id: "haiku", label: "Haiku · fastest" },
];

export const AGENTS: Array<{
	id: Agent;
	label: string;
	models?: Array<{ id: string; label: string }>;
	hint: string;
}> = [
	{
		id: "claude",
		label: "Claude Code",
		models: CLAUDE_MODELS,
		hint: "Default is your plan's default. Claude Code runs the latest version of the one you pick; your plan decides which you can use.",
	},
	{ id: "cursor", label: "Cursor", hint: "the model set in Cursor" },
	{ id: "codex", label: "Codex", hint: "the model set in Codex" },
	{ id: "ollama", label: "Ollama (local)", hint: "e.g. qwen2.5-coder:14b" },
	{ id: "omlx", label: "oMLX (local)", hint: "a model loaded in oMLX" },
	{ id: "local", label: "OpenAI-compatible server", hint: "the server's model id" },
];

let agentList: Promise<AgentStatus[]> | undefined;

/** The agents `eds agents` reports, asked once per app run; null until they arrive. */
export function useAgentStatuses(): AgentStatus[] | null {
	const [list, setList] = useState<AgentStatus[] | null>(null);
	useEffect(() => {
		agentList ??= api.agents().catch((err) => {
			agentList = undefined; // ask again next time
			throw err;
		});
		agentList.then(setList, () => setList([]));
	}, []);
	return list;
}

/** The agents installed here that the studio can keep inside the project, in the order eds tries them. */
export const usableAgents = (statuses: AgentStatus[] | null): Agent[] =>
	(statuses ?? []).filter((s) => s.installed && s.confined).map((s) => s.type as Agent);

/** The agent that answers when none is picked: the project's, else the first one eds would use. */
export function useDefaultAgent(projectAgent?: Agent) {
	const statuses = useAgentStatuses();
	const id = projectAgent ?? usableAgents(statuses)[0];
	return { id, label: AGENTS.find((a) => a.id === id)?.label ?? id, loading: !statuses };
}

/** Which agents stay inside the project. */
function useConfined(): Partial<Record<Agent, boolean>> {
	const list = useAgentStatuses() ?? [];
	return Object.fromEntries(list.map((a) => [a.type, a.confined]));
}

/** Agent + model. Empty means "the project's default" (or what the CLI detects). */
export function ModelPicker(props: {
	value: ModelChoice;
	onChange: (v: ModelChoice) => void;
	defaultLabel?: string;
	projectAgent?: Agent;
}) {
	const { value, onChange } = props;
	const fallback = useDefaultAgent(props.projectAgent);
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
						<option value="">
							{props.defaultLabel ?? (fallback.label ? `Default (${fallback.label})` : "Default")}
						</option>
						{AGENTS.map((a) => (
							<option key={a.id} value={a.id} disabled={outside(a.id)}>
								{a.label}
								{outside(a.id) ? " · can't be kept to the project" : ""}
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
							<option value="">Default (your plan's)</option>
							{agent.models.map((m) => (
								<option key={m.id} value={m.id}>
									{m.label}
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
			{agent?.models && <p className="muted small model-hint">{agent.hint}</p>}
			{agent && outside(agent.id) && (
				<p className="agent-warning small">
					{agent.label} can't be kept inside this project here, so the studio won't run it. Pick
					Claude Code or a local model.
				</p>
			)}
		</>
	);
}
