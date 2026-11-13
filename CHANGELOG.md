# Changelog

All notable changes to aem-eds-studio. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **HTTPS from anywhere through Tailscale. When Tailscale runs on the computer, Settings → Network access offers Tailscale HTTPS: the studio runs `tailscale serve`, the computer gets an address like `https://studio-mac.tail1234.ts.net` with a real certificate, and new pairing codes use it first. A guide, [docs/remote.md](docs/remote.md), covers Wi-Fi, Tailscale and revoking** (STUDIO-145)
- **Pair a phone or another computer. Settings → Network access has a switch (off by default) and "Pair a device", which shows a QR code and link for each address (Wi-Fi/LAN and Tailscale) that work once, for 5 minutes. The other device names itself and pairs. It can then use the chat, start or change drafts and review them, while what only the computer may do (adding or removing projects, project settings, accepting or discarding, settings and sign-ins) is left out of its pages. Paired devices are listed in Settings with Revoke; an unpaired device is told how to pair** (STUDIO-143)
- **Network access, step one of reaching the studio from a phone or another computer. A switch in Settings (off by default; the switch itself comes with pairing in the next step) opens a second listener on port 4610 for paired devices only. A device pairs once with a one-time code and then reads projects, threads and drafts, chats, and starts or changes a draft. Settings, every token, projects, accepting into the repository and managing devices stay on the computer. The studio keeps only a hash of each device's key, and a device can be revoked** (STUDIO-141)
- **Threads in the side menu show a small spinner while their agent answers, and an accent dot when an answer arrived that you haven't opened yet, so several chats can run at once without checking each one. What you've seen is kept on this computer** (STUDIO-139)

### Changed
- **A wider Settings dialog (up to 780px), with Done kept at the bottom while its content scrolls** (STUDIO-153)
- **A paired device is named after itself: its model where the browser shares it (Chrome on Android, e.g. "Pixel 8 · Chrome"), else the kind of device and the browser ("iPhone · Safari", "Mac · Chrome"). An iPad that asks for desktop pages is still named iPad. The name stays editable** (STUDIO-151)
- **The agent's answers read as Markdown: tables, lists, headings, code blocks, links, bold and italic, built from React elements so nothing in an answer runs. Tables scroll sideways on a narrow screen, and inline code wraps cleanly. On a phone the agent's mark sits above its answer, which gets the full width, and the menu button is a 44px target** (STUDIO-149)
- **A new thread opens under the studio's own `>_` mark, its cursor blinking, instead of a sparkle in a glowing square that read as a loading spinner. While the agent works, its avatar plays the logo's animation on a loop (the flip, the > nudging, the blinking cursor) in place of the ring spinner** (STUDIO-147)
- **A more polished chat. A new thread opens on a welcome screen with four ways to start: build a block from a design, match a screenshot, ask what's in the project, or talk through a pull request. The message box grows as you write and shows the Enter and Shift+Enter keys; Send is a round button with a spinner while it sends. The agent's answers carry its >_ mark; while it works, a spinner shows how long it has taken. A thread shows placeholder lines while it opens. Motion stays off when the system asks for reduced motion** (STUDIO-137)

## [0.4.7] - 2026-11-12

### Added
- **A chat is the project's first screen. Describe what you want in plain words or ask about the project; threads are listed under Chat in the side menu, each at its own address. Paste or drop images and text files, drag a pull request or another thread in from the side menu, and select text in any message to quote it, even into another thread. Keep writing while the agent answers: the messages wait and go to it together. When the agent proposes building a block or changing a draft, Yes sets it up, and nothing runs before that; Blocks opens the New block form right there. Each answer is one read-only `eds ask` turn, kept inside the project; engine aem-eds-kit 0.4.81** (STUDIO-126)
- **Switches in Settings for GitHub and automatic updates. GitHub off keeps the studio to local folders, with nothing sent to GitHub, and keeps the sign-in saved; with updates off, "Check for updates now" stays** (STUDIO-120)
- **Sign out of GitHub in Settings, with the signed-in account and where its token came from** (STUDIO-120)
- **The open project's pull requests in a folding section at the bottom of the sidebar, like VS Code's panels: a status dot each (green open, grey draft, purple merged, red closed), open ones first, merged and closed ones in Merged / archive** (STUDIO-124)

### Changed
- **Setup is a tab in Settings, and Guide an icon in the sidebar's corner next to Usage. A dot on the Settings icon shows when something needs setting up, and a missing requirement opens Settings on its Setup tab** (STUDIO-120)
- **A cleaner project page: the header says where the project comes from, its path and default agent; the block name, agent and model share a row; drafts show a count and fold the accepted ones away; project settings (default agent, export, remove) moved into a dialog behind the Project settings button** (STUDIO-122)

### Fixed
- **Setup: a Claude Code too old for `--restricted` is told to update (`claude update`), instead of being told to use Claude Code and offered its install command** (STUDIO-118)

## [0.4.6] - 2026-11-12

### Security
- **Connect GitHub reaches only the repositories you pick: the studio signs in through its GitHub App, which you install on just those repositories (Contents and pull requests: read and write; issues: read), instead of an OAuth App with access to every repository of the account. The token renews itself every 8 hours; "Choose repositories on GitHub" changes the pick. Connect GitHub again after updating** (STUDIO-110)

### Fixed
- **Connect GitHub shows what GitHub said when it refuses the sign-in (e.g. Device Flow not enabled), and names an unknown app instead of a bare "GitHub 404"** (STUDIO-112)

## [0.4.5] - 2026-11-12

### Security
- **The desktop app uses only the GitHub access it was given (Connect GitHub, or a token in Settings behind "Use a token instead"); it no longer picks up the GitHub CLI's token or GITHUB_TOKEN from the shell. The browser mode still reads GITHUB_TOKEN** (STUDIO-107)
- **Only the chosen project: the studio runs only agents kept inside it: Claude Code (`--restricted`), local models, and Codex in an OS sandbox on macOS and Linux. Cursor, and Codex on Windows, can't be, so they're greyed out in the agent list and the Setup window says why** (STUDIO-95)

### Changed
- **Node.js 22 or newer to run the studio in a browser (`npm start`), as the engine now needs it; the desktop app brings its own** (STUDIO-95)

### Added
- **Connect GitHub with GitHub's own sign-in: the studio's OAuth App is registered, so you enter a short code on github.com instead of pasting a token** (STUDIO-105)
- **Paste a GitHub token in Settings: GitHub checks it first, then the system keychain keeps it; GitHub works without registering an OAuth App** (STUDIO-103)
- **Usage window next to History: each plan's limits as the agent reports them (Claude Code's 5-hour and weekly: percent, reset time) and the tokens, cache and API value of the studio's runs, today, 7 and 30 days, per model; engine aem-eds-kit 0.4.79, which reports them** (STUDIO-101)
- **Settings and History in the corner of the sidebar: GitHub, a Figma token kept in the system keychain (handed to jobs, never shown again), the engine; the open project's commits, with blocks accepted in the studio marked** (STUDIO-99)
- **Read a Figma design from a PNG/SVG export: no API call, for free Figma plans** (STUDIO-93)

### Fixed
- **Setup no longer offers Connect GitHub in a build without GitHub sign-in; it offers a token in Settings, `gh auth login` or GITHUB_TOKEN instead** (STUDIO-103)
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

[Unreleased]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.7...main
[0.4.7]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.6...v0.4.7
[0.4.6]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.5...v0.4.6
[0.4.5]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/piotrgodycki/aem-eds-studio/releases/tag/v0.2.0
