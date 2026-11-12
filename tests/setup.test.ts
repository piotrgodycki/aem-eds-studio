import { describe, expect, it } from "vitest";
import { type AgentInfo, agentCheck } from "../src/server/setup.js";

const claude: AgentInfo = {
	type: "claude",
	name: "Claude Code",
	installed: true,
	ready: false,
	confined: true,
	install: "npm install -g @anthropic-ai/claude-code",
};
const codex: AgentInfo = { ...claude, type: "codex", name: "Codex", confined: false };

describe("agent check", () => {
	it("is fine when an agent that stays in the project is signed in", () => {
		const check = agentCheck([
			{ ...claude, ready: true },
			{ ...codex, ready: true },
		]);
		expect(check).toMatchObject({ ok: true, detail: "Claude Code is signed in." });
	});

	it("fails when the signed-in agent can't be kept inside the project", () => {
		const check = agentCheck([claude, { ...codex, ready: true }]);
		expect(check).toMatchObject({ ok: false, fix: undefined });
		expect(check.detail).toMatch(/Codex can't be kept inside the project/);
		const old = agentCheck([{ ...claude, ready: true, confined: false }]);
		expect(old.fix).toEqual({ kind: "command", command: claude.install });
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
