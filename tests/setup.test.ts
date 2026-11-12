import { describe, expect, it } from "vitest";
import { type AgentInfo, agentCheck } from "../src/server/setup.js";

const claude: AgentInfo = {
	type: "claude",
	name: "Claude Code",
	installed: true,
	ready: false,
	install: "npm install -g @anthropic-ai/claude-code",
};

describe("agent check", () => {
	it("is fine when any agent is signed in", () => {
		const check = agentCheck([claude, { ...claude, type: "codex", name: "Codex", ready: true }]);
		expect(check).toMatchObject({ ok: true, detail: "Codex is signed in." });
	});

	it("offers sign-in for an installed agent that is signed out", () => {
		expect(agentCheck([claude]).fix).toEqual({ kind: "signin", agent: "claude" });
	});

	it("offers the install command when no agent is installed", () => {
		expect(agentCheck([{ ...claude, installed: false }]).fix).toEqual({
			kind: "command",
			command: claude.install,
		});
	});

	it("fails without a fix when the agents can't be listed", () => {
		const check = agentCheck(null);
		expect(check.ok).toBe(false);
		expect(check.fix).toBeUndefined();
	});
});
