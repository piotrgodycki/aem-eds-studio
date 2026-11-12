# Changelog

All notable changes to aem-eds-studio. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- **Only the chosen project: the studio runs only agents kept inside it: Claude Code (`--restricted`), local models, and Codex in an OS sandbox on macOS and Linux. Cursor, and Codex on Windows, can't be, so they're greyed out in the agent list and the Setup window says why** (STUDIO-95)

### Changed
- **Node.js 22 or newer to run the studio in a browser (`npm start`), as the engine now needs it; the desktop app brings its own** (STUDIO-95)

### Added
- **Usage window next to History: each plan's limits as the agent reports them (Claude Code's 5-hour and weekly: percent, reset time) and the tokens, cache and API value of the studio's runs, today, 7 and 30 days, per model; engine aem-eds-kit 0.4.79, which reports them** (STUDIO-101)
- **Settings and History in the corner of the sidebar: GitHub, a Figma token kept in the system keychain (handed to jobs, never shown again), the engine; the open project's commits, with blocks accepted in the studio marked** (STUDIO-99)
- **Read a Figma design from a PNG/SVG export: no API call, for free Figma plans** (STUDIO-93)

### Fixed
- **Engine aem-eds-kit 0.4.78: a round of changes can change the text, which lives in the block's preview content** (STUDIO-95)
- **Remove from studio works again; a failed removal says why** (STUDIO-97)

## [0.4.4] - 2026-11-12

### Changed
- **Biome 2 and TypeScript 7; the tutorial's step dots and two effects follow the new lint rules** (STUDIO-89)

### Removed
- **Leftovers: the old top bar's styles, an unused type and option, stale comments; the engine's minimum version in one place (0.4.69)** (STUDIO-83)

### Added
- **Setup window: what the studio still needs (engine, Git, an agent, GitHub, Figma token) and a fix for each; it opens by itself when something required is missing** (STUDIO-85)
- **Engine aem-eds-kit 0.4.69: the screenshot check uses Figma REST with a token (no MCP call), or the scraped page** (STUDIO-78)
- **Choose how the design is read: Figma through REST or MCP, other pages public or signed in** (STUDIO-76)
- **Delete a draft from the project's list** (STUDIO-74)

### Fixed
- **The screenshot check says what it costs (+1 REST or MCP call, or none for a scraped page) instead of "free"** (STUDIO-87)
- **The app quits right away even while the page is polling (the packaged smoke test hung on it)** (STUDIO-85)
- **Full screen preview works again** (STUDIO-72)

## [0.4.3] - 2026-11-09

### Changed
- **Agent sign-in with the provider (Anthropic, OpenAI) in the browser, without a terminal** (STUDIO-69)

## [0.4.2] - 2026-11-08

### Fixed
- **Dropdowns in the app's style; agent and model stack on a phone** (STUDIO-64)
- **Agent sign-in on macOS without asking to control Terminal** (STUDIO-62)

### Security
- **Electron 45 and patched dependencies** (STUDIO-53)
- **Window permissions denied, a Content Security Policy, a stricter file check in the UI server** (STUDIO-55)

### Changed
- **Clearer description: the desktop studio for aem-eds-kit** (STUDIO-66)
- **Current GitHub Actions; only the release job can write; Dependabot and CodeQL** (STUDIO-57)
- **Short README and CHANGELOG, with the tech stack** (STUDIO-50)

## [0.4.1] - 2026-11-08

### Fixed
- **The engine's name in the side menu** (STUDIO-48)
- **No keychain prompt at every launch on macOS** (STUDIO-46)

## [0.4.0] - 2026-11-08

### Added
- **First-run tutorial** (STUDIO-17)

### Changed
- **aem-eds-kit 0.4.63** (STUDIO-43)
- **One-click releases** (STUDIO-41)
- **Full width, with a side menu** (STUDIO-39)
- **README says how the studio and aem-eds-kit fit together** (STUDIO-34)
- **Release from Actions** (STUDIO-33)

### Fixed
- **Copying text in the desktop app** (STUDIO-37)
- **"Not logged in" from the agent** (STUDIO-37)

## [0.3.0] - 2026-11-07

### Added
- **Connect GitHub** (STUDIO-28)
- **In-app updates** (STUDIO-26)
- **Choose a local folder** (STUDIO-24)
- **Project settings import and export** (STUDIO-20)
- **Several projects at once** (STUDIO-20)
- **Work board** (STUDIO-18)
- **Devices and a collapsible review panel** (STUDIO-15)

### Changed
- **aem-eds-kit 0.4.62** (STUDIO-22)
- **README** (STUDIO-13, STUDIO-30)

## [0.2.0] - 2026-11-06

### Added
- **Projects** (STUDIO-1)
- **Drafts with review rounds** (STUDIO-1)
- **Local-only server** (STUDIO-1)
- **The engine is bundled** (STUDIO-3)
- **Desktop app only** (STUDIO-9)
- **Desktop app for macOS and Windows** (STUDIO-5)

### Changed
- **The aem-eds-kit look** (STUDIO-7)
- **Draft review fills the window** (STUDIO-7)

[Unreleased]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.4...main
[0.4.4]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/piotrgodycki/aem-eds-studio/releases/tag/v0.2.0
