import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain .mjs script, no types
import { notes, release } from "../scripts/changelog-release.mjs";

const before = `# Changelog

## [Unreleased]

### Added
- **Side menu** (STUDIO-39).

## [0.3.0] - 2026-11-07

### Added
- **Updates** (STUDIO-26).

[Unreleased]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.3.0...main
[0.3.0]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.2.0...v0.3.0
`;

describe("Release workflow: CHANGELOG", () => {
	it("moves Unreleased under the new version, with its compare links", () => {
		const out = release(before, "0.3.1", "2026-11-08");
		expect(out).toContain(
			"## [Unreleased]\n\n## [0.3.1] - 2026-11-08\n\n### Added\n- **Side menu** (STUDIO-39).",
		);
		expect(out).toContain(
			"[Unreleased]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.3.1...main\n[0.3.1]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.3.0...v0.3.1\n[0.3.0]:",
		);
		expect(notes(out, "0.3.1")).toBe("### Added\n- **Side menu** (STUDIO-39).");
		expect(notes(out, "0.3.0")).toBe("### Added\n- **Updates** (STUDIO-26).");
	});

	it("refuses to release an empty Unreleased", () => {
		const released = release(before, "0.3.1", "2026-11-08");
		expect(() => release(released, "0.3.2", "2026-11-09")).toThrow(/Nothing under/);
	});
});
