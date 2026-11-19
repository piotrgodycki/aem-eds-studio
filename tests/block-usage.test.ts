import { describe, expect, it } from "vitest";
import { notesFor } from "../src/web/blockNotes.js";

const block = (over: Partial<Parameters<typeof notesFor>[0]>) => ({
	name: "cards",
	pages: 5,
	views: null,
	clickRate: null,
	lastChange: null,
	...over,
});

describe("what to do about a block", () => {
	it("says a block on no page can go, but never header or footer", () => {
		expect(notesFor(block({ pages: 0 }), 100, [])).toEqual([
			{ kind: "unused", text: "is on no page, it can go" },
		]);
		expect(notesFor(block({ name: "header", pages: 0 }), 100, ["nav_click"])).toEqual([]);
	});

	it("asks for wide testing when a block is on many pages", () => {
		expect(notesFor(block({ pages: 40 }), 100, ["block_click"]).map((n) => n.kind)).toEqual([
			"wide",
		]);
		expect(notesFor(block({ pages: 9 }), 20, ["block_click"])).toEqual([]);
	});

	it("flags a block that is seen but rarely clicked, and one that sends no events", () => {
		const notes = notesFor(block({ views: 6900, clickRate: 0.004 }), 100, []);
		expect(notes.map((n) => n.text)).toEqual([
			"seen 6.9k times, only 0.4% click it",
			"seen 6.9k times, sends no events",
		]);
	});

	it("has nothing to say about a tracked block with normal traffic", () => {
		expect(notesFor(block({ views: 2000, clickRate: 0.03 }), 100, ["promo_click"])).toEqual([]);
	});
});
