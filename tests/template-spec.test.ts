import { describe, expect, it } from "vitest";
import { InputError, templateSpec } from "../src/server/validate.js";

describe("template spec from the builder", () => {
	it("keeps a well-formed spec and fills what is missing", () => {
		expect(
			templateSpec({
				name: "product-detail",
				sections: [{ style: ["highlight"], blocks: [{ name: "hero", fields: { title: "Hi" } }] }],
			}),
		).toEqual({
			name: "product-detail",
			title: "product-detail",
			sections: [
				{ style: ["highlight"], blocks: [{ name: "hero", variant: [], fields: { title: "Hi" } }] },
			],
		});
	});

	it("refuses names that could turn into options or paths", () => {
		expect(() => templateSpec({ name: "../x", sections: [] })).toThrow(InputError);
		expect(() => templateSpec({ name: "t", sections: [{ blocks: [{ name: "--help" }] }] })).toThrow(
			InputError,
		);
		expect(() =>
			templateSpec({
				name: "t",
				sections: [{ blocks: [{ name: "hero", variant: ['x" onload'] }] }],
			}),
		).toThrow(InputError);
	});

	it("takes starting content only as text by field name", () => {
		expect(() =>
			templateSpec({ name: "t", sections: [{ blocks: [{ name: "hero", fields: { title: 1 } }] }] }),
		).toThrow(InputError);
		expect(() =>
			templateSpec({
				name: "t",
				sections: [{ blocks: [{ name: "hero", fields: { "a b": "x" } }] }],
			}),
		).toThrow(InputError);
	});
});
