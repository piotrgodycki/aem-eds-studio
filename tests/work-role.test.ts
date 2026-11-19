import { describe, expect, it } from "vitest";
import { ROLE_CHAT } from "../src/web/chatRoles.js";
import { parseRoute } from "../src/web/router.js";
import { homeTab, ROLE_TABS, ROLES } from "../src/web/workRole.js";

describe("roles", () => {
	it("starts every role on the chat, with its own screen right after", () => {
		for (const [role] of ROLES) expect(homeTab(role)).toBe("chat");
		expect(homeTab(null)).toBe("chat");
		expect(ROLE_TABS.manager[1]).toBe("report");
		expect(ROLE_TABS.qa[1]).toBe("check");
		expect(ROLE_TABS.content[1]).toBe("authoring");
	});

	it("shapes the chat's welcome for each role, every starter leading somewhere", () => {
		for (const [role] of ROLES) {
			const chat = ROLE_CHAT[role];
			expect(chat.heading("site")).toContain("site");
			expect(chat.starters).toHaveLength(4);
			for (const s of chat.starters)
				expect(
					"text" in s || "blocks" in s || ("tab" in s && ROLE_TABS[role].includes(s.tab)),
				).toBe(true);
		}
	});

	it("gives Performance to developers and QA, and leaves it under More for a manager", () => {
		expect(ROLE_TABS.developer).toContain("performance");
		expect(ROLE_TABS.qa).toContain("performance");
		expect(ROLE_TABS.manager).not.toContain("performance");
	});

	it("routes to every tab a role leads with", () => {
		for (const [role] of ROLES)
			for (const tab of ROLE_TABS[role].filter((t) => t !== "chat"))
				expect(parseRoute(`#/p/abc/${tab}`)).toEqual({ page: "project", id: "abc", tab });
	});
});
