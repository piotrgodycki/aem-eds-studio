import { describe, expect, it } from "vitest";
import { parseRoute } from "../src/web/router.js";
import { homeTab, ROLE_TABS, ROLES } from "../src/web/workRole.js";

describe("roles", () => {
	it("starts each role on its own screen, a developer on the chat as before", () => {
		expect(homeTab("manager")).toBe("report");
		expect(homeTab("qa")).toBe("check");
		expect(homeTab("content")).toBe("authoring");
		expect(homeTab("developer")).toBe("chat");
		expect(homeTab(null)).toBe("chat");
	});

	it("routes to every tab a role leads with", () => {
		for (const [role] of ROLES)
			for (const tab of ROLE_TABS[role].filter((t) => t !== "chat"))
				expect(parseRoute(`#/p/abc/${tab}`)).toEqual({ page: "project", id: "abc", tab });
	});
});
