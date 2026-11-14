# Changelog

All notable changes to aem-eds-studio. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Drafts on your tickets' branches. Project settings → Ticket branches takes your tickets' key (e.g. `CURLY`); then, in a GitHub project, a draft starts only with its ticket: the New block form asks Feature or Bug and the number, and so does a change proposed in the chat for a block with no draft yet (also after a yes in words). Its versions, aem.page preview and pull request use `feature/CURLY-111` or `bug/CURLY-123`. Without a key, drafts stay on `draft/<name>`. Engine aem-eds-kit 0.4.93** (STUDIO-246)
- **The studio's own logs, to see whether it works. The server and the desktop app write what they do and what goes wrong (start, every agent run with how it ended and how long it took, API errors, failed GitHub calls, updates, crashes and errors in the page) to `~/.aem-eds-studio/logs/studio.log`, rotated at 2 MB with three files kept; tokens are masked. Settings → Logs shows the latest lines live, filtered to warnings or errors if you like, with Copy and, in the desktop app, Show log files** (STUDIO-234)
- **Working agents at a glance. Outside a draft's review, a small palette in the bottom-right corner says how many agents are working (just above the chat's message box) and opens to list them across projects, with a link to each one's log; one that finished or failed stays there for 10 minutes until you tick it off. The desktop app also puts it on the desktop, always on top, in the corner chosen in Settings → Agents on the desktop (or Off). It stays while the app's window is closed: the app keeps running while an agent works or the palette has something to show, and clicking an agent opens the app on its log. Right-click it to open the studio, hide it or quit. It replaces the running-jobs pill in the side menu** (STUDIO-225)
- **Settings → Preview port: the review's local preview runs on a port you choose (e.g. `127.0.0.1:4655`), so its address stays the same between reviews. When the port is taken, or left empty, any free port is used, as before** (STUDIO-221)
- **Review on the devices of Chrome's device toolbar, or on all three at once. Under each preview a menu picks the device: laptops (1280, 1440) and Full HD for desktop, iPad Mini, iPad Air, iPad Pro, Surface Pro 7 and Asus Zenbook Fold for tablet, iPhone SE, iPhone 12 Pro, iPhone 14 Pro Max, Pixel 7, Galaxy and Surface Duo for mobile, remembered per kind. **All** shows desktop, tablet and mobile side by side at one scale, with the side menu out of the way for room** (STUDIO-219)
- **Say yes in words. With a proposal under the last answer, writing "yes", "tak", "ok" or "do it" (any language) runs exactly that proposal: a change starts at once, its progress under the answer, and a new block opens its form. "Yes, but bigger" gets a changed proposal instead, and anything else greys it out. The proposal's button is now a small round check, for those who'd rather click. Only the proposal on screen can run this way: the agent can't invent an action and run it. Engine aem-eds-kit 0.4.85** (STUDIO-192)
- **`@` in the message box points at things in the project: an open draft, a block in `blocks/`, an issue or pull request from the work board, or a piece of agent work from the Agents tab. Typing `@` lists them (filtered as you type; arrows, Enter or Tab, Escape), and a pick goes along as a chip. The agent gets where to read a draft's rounds and comments or a block's files, an issue's description, a pull request's diff, and the end of an agent job's log ("why did this fail?")** (STUDIO-188)
- **Your role in a GitHub project, in its header: Developer (Write access or more: you can accept drafts) or Contributor (Triage or Read: you create, chat and review, and a developer accepts). In review, a contributor sees who accepts instead of the Accept button** (STUDIO-167)
- **HTTPS from anywhere through Tailscale. When Tailscale runs on the computer, Settings → Network access offers Tailscale HTTPS: the studio runs `tailscale serve`, the computer gets an address like `https://studio-mac.tail1234.ts.net` with a real certificate, and new pairing codes use it first. A guide, [docs/remote.md](docs/remote.md), covers Wi-Fi, Tailscale and revoking** (STUDIO-145)
- **Pair a phone or another computer. Settings → Network access has a switch (off by default) and "Pair a device", which shows a QR code and link for each address (Wi-Fi/LAN and Tailscale) that work once, for 5 minutes. The other device names itself and pairs. It can then use the chat, start or change drafts and review them, while what only the computer may do (adding or removing projects, project settings, accepting or discarding, settings and sign-ins) is left out of its pages. Paired devices are listed in Settings with Revoke; an unpaired device is told how to pair** (STUDIO-143)
- **Network access, step one of reaching the studio from a phone or another computer. A switch in Settings (off by default; the switch itself comes with pairing in the next step) opens a second listener on port 4610 for paired devices only. A device pairs once with a one-time code and then reads projects, threads and drafts, chats, and starts or changes a draft. Settings, every token, projects, accepting into the repository and managing devices stay on the computer. The studio keeps only a hash of each device's key, and a device can be revoked** (STUDIO-141)
- **Threads in the side menu show a small spinner while their agent answers, and an accent dot when an answer arrived that you haven't opened yet, so several chats can run at once without checking each one. What you've seen is kept on this computer** (STUDIO-139)

### Changed
- **You decide when a draft's next version is made. In review, what you write under the preview no longer starts the agent at once: each change is added (Enter or +) to the conversation as "for v4", where it can be removed, and **Make v4** sends all of them to the agent in one go, from the version you pick. The changes are kept by the studio per draft, so they survive a restart and show on paired devices. A change you say yes to in the chat still starts at once** (STUDIO-242)
- **The studio is built with pnpm: `pnpm-lock.yaml` replaces `package-lock.json` (same versions), `packageManager` pins pnpm, and CI, the desktop builds and releases install with `pnpm install --frozen-lockfile`. `.npmrc` keeps a flat `node_modules` (`node-linker=hoisted`) so the app bundles aem-eds-kit as before. aem-eds-kit itself stays on npm** (STUDIO-238)
- **The review's conversation is a thread like the chat, with no boxes in boxes: your requests on the right, the agent's versions on the left beside the >_ mark ("v3 ready", issues), and a running change as one line saying what the agent does right now, with its full log a click away in Agents** (STUDIO-232)
- **The agents palette wears the studio's mark: the orange >_ tile, turning like the logo while agents work, with a badge for how many while they work and afterwards a dot in the colour of how the last one ended (green done, yellow stopped, red failed), the same dots as in its list, and under the headline what the latest is doing and where, on a dark glass card** (STUDIO-230)
- **The review shows the draft's conversation: every change asked for, from the review or from the chat, with the version it made, and a running change's live log last, wherever it was started. It folds to one line over the message box. Agents is a full-width list: clicking an agent opens its log right under it, with Stop, the review and Close** (STUDIO-224)
- **Open pull request asks who should review it: the repository's collaborators, with their avatars, to tick before it opens. The pull request is assigned to whoever opens it. The project's header (its name and tabs) stays at the top while the page scrolls. Settings says just `aem-eds-kit 0.4.88` for the engine and has a License section. A chat change's bubble turns grey once the change has started, so an accepted change no longer glows orange. A change asked for in the review shows its agent's log under the preview again and opens the new version when it ends (lost with the side panel)** (STUDIO-217)
- **An accepted draft can be reopened: Reopen in the review takes it back into review with its versions and branch, and its open pull request gets the next versions. When a draft's branch is behind the default branch, the review shows "3 behind · Update", which merges the newer commits into the branch and pushes it (the working tree is untouched); on a conflict nothing changes and the files are named. Drafts marks such a draft "3 behind main". Engine aem-eds-kit 0.4.88** (STUDIO-215)
- **The pull request a draft opens reads well. Open pull request has the agent write its title and an English description (Summary, Changes in review, How to check, never quoting the reviewers' notes), takes screenshots of the accepted version at each breakpoint with headless Chromium and commits them on the draft's branch (`blocks/<name>/__snapshots__/`, the baselines `eds block test` uses), and adds them as a table, plus the Test URLs (before on the default branch, after on the draft's branch, on aem.live) that the AEM PSI Check app reads. Without a browser for the screenshots the pull request still opens, and the review says why they're missing. Engine aem-eds-kit 0.4.87** (STUDIO-210)
- **After Accept, the review no longer shows some other pull request as if it were the draft's: only one opened from `draft/<name>` counts, so the pull request appears only after Open pull request. The review bar is leaner: no Full screen, the local preview opens from an icon, and the aem.page preview is a globe with "Live"** (STUDIO-208)
- **In a GitHub project a draft is a branch. Every new version (from a design, a chat change or a review comment) is pushed to `draft/<name>`, and the review shows **Live on aem.page**, a preview anyone can open (with the AEM Code Sync app on the repository). **Accept** makes the chosen version the branch's tip and opens a pull request from it with the review rounds as its description; the accepted draft links to it. The work board's Dev review is now **PR review** and holds pull requests only, so it matches the Pull requests panel; drafts stay in In progress until accepted. A local folder accepts into `blocks/` on a branch named in a small form under Accept. The review has no side panel any more: Accept, Open pull request and Discard sit in its bar, and changes are asked for in a message box under the preview, as in the chat, with the version to start from ("from v2") and the agent beside it; the next version's number counts from the latest, not the one under review. Engine aem-eds-kit 0.4.84** (STUDIO-205)
- **The review picks its version from one dropdown instead of a tab per version: "v4 · latest", opening the versions latest first, each with its review comment and an issues tag when the checks failed** (STUDIO-203)
- **Drafts are a full-width list with dividers: each row has the name, its latest version and count, the last review comment and the delete icon at the right. Blocks shows the New block from a design form at full width, and under it the blocks already in `blocks/`, each linking to its draft when one waits for review** (STUDIO-201)
- **The message box always sits at the bottom of the window, 16px above its edge, in a new thread as in a long one, and the last message keeps a clear gap above it instead of touching it** (STUDIO-198)
- **The side menu folds like an accordion: each project has a chevron that opens its Chat and threads (any project, not only the open one), and Chat folds its thread list. The open project starts unfolded; what you fold is remembered on this computer** (STUDIO-196)
- **The desktop app reads its tokens from the keychain one at a time and keeps them in memory once read, so an unsigned build on macOS asks for the keychain once at start instead of once per token (GitHub and Figma read together asked twice)** (STUDIO-193)
- **The project header is one compact line: the name with its source icon, a link to GitHub, the path behind a button, your role and the default agent, and Project settings at the top right; no more "GitHub" label and big title. A new chat fills what's left of the window and fits without scrolling (on a short window the welcome drops its description); the chat scrolls to the end only when the thread has messages, at once when you open it** (STUDIO-185)
- **An Agents tab beside Chat, Blocks, Drafts and Work board, with the number running: every piece of agent work in the project since the studio started (building or changing a block, answering in the chat, accepting, discarding), running first, with the agent, status and time; the picked one shows its live log, with Stop while it runs and a link to the review. The "running" pill in the side menu and the work board's running cards open the job there, instead of a draft that may not exist yet** (STUDIO-184)
- **The work board shows the studio's own work, not only GitHub's: a block being built or changed is a card in In progress (with the agent and how long, updating while it runs), and an open draft waits in Dev review, linking to its review. A project without GitHub still gets the board, with a one-line note instead of an empty box** (STUDIO-182)
- **The project header names the agent that answers by default (e.g. "Claude Code", the project's or the first one eds would use; also in the New block form's agent list, instead of "detected") and, under the title, the repository (a link) or the folder's name. The workspace path is hidden behind a small button that shows it with Copy. Drafts get their own tab beside Chat, Blocks and Work board, with the number waiting; Blocks keeps the New block form. The side menu lists only the project's chat and threads, no longer Blocks and Work board; the tabs stay on one line on a phone** (STUDIO-180)
- **A proposal is a bubble under the agent's answer: an accent mark (an arrow that nudges towards the yes now and then while it waits, still for reduced motion), what it does ("Change hero" with the request, or "Build footer-links" from the design's site) and the yes beside it, full width on a phone. No more bordered card with a "Proposed" label. Once the talk moves on (any message after it), the proposal greys out into a small quiet bubble with nothing to press** (STUDIO-177)
- **The chat changes a block already in `blocks/` straight away, no design needed: Yes on "Change hero: …" makes a draft from the block as it is and applies the change, with a link to the review. The card no longer offers to start an existing block from a design. Engine aem-eds-kit 0.4.83** (STUDIO-175)
- **The chat scrolls to the newest message after you send and when an answer arrives, above the floating message box. A proposal is a card only on the very last answer; once the talk moves on it is a line. Engine aem-eds-kit 0.4.82, whose `eds ask` proposes changes only to drafts that exist** (STUDIO-173)
- **Only the latest agent answer shows its proposal as a card; earlier proposals are a single muted line. The sparkle icon is a four-point star, no longer a ring of rays that read as a loading spinner** (STUDIO-171)
- **Yes on a proposed change runs it in the chat, with its progress under the proposal and a link to the review when it is done, instead of jumping to Review. When the draft it names doesn't exist (the agent named a block that has none), the card says so and offers to start that block from a design** (STUDIO-169)
- **A minimal agent choice in the message box: a chip named after the agent that will answer (e.g. Claude Code), whose small menu lists only the agents installed here that the studio can keep inside the project. Once an agent is picked, a Model chip appears beside it with that agent's models** (STUDIO-165)
- **The chat uses the project page directly, with no card around it. Claude Code's models are its current aliases (Fable, Opus, Sonnet, Haiku), with Default being the plan's own; Claude Code runs the latest version of the one picked, and the plan decides which can be used. The message box shows a scrollbar only once its text no longer fits** (STUDIO-163)
- **A shorter README with screenshots of the chat, the review and the studio on a phone** (STUDIO-161)
- **Deleting a thread or a draft, discarding a draft, removing a project or revoking a device asks in the studio's own dialog instead of the browser's: an icon, a short question ("Delete this thread?"), the item's name, one line on what happens, and Cancel or a red action. Focus starts on Cancel, and Escape cancels** (STUDIO-157)
- **A message box like Claude's. It floats at the bottom of the window over the conversation, starts at one line and grows as you write. Send is an up arrow; the Enter / Shift+Enter hints are gone. A + button adds images, files or a block from a design, and typing / lists commands: /block, /refine, /file, /agent, /new, /clear (arrows to move, Enter or Tab to run, Escape to close)** (STUDIO-159)
- **The agent can change in the middle of a chat thread: the Agent button stays in the message box, and the thread answers with the chosen agent and model from the next message on (default: the project's)** (STUDIO-155)
- **A wider Settings dialog (up to 780px), with Done kept at the bottom while its content scrolls** (STUDIO-153)
- **A paired device is named after itself: its model where the browser shares it (Chrome on Android, e.g. "Pixel 8 · Chrome"), else the kind of device and the browser ("iPhone · Safari", "Mac · Chrome"). An iPad that asks for desktop pages is still named iPad. The name stays editable** (STUDIO-151)
- **The agent's answers read as Markdown: tables, lists, headings, code blocks, links, bold and italic, built from React elements so nothing in an answer runs. Tables scroll sideways on a narrow screen, and inline code wraps cleanly. On a phone the agent's mark sits above its answer, which gets the full width, and the menu button is a 44px target** (STUDIO-149)
- **A new thread opens under the studio's own `>_` mark, its cursor blinking, instead of a sparkle in a glowing square that read as a loading spinner. While the agent works, its avatar plays the logo's animation on a loop (the flip, the > nudging, the blinking cursor) in place of the ring spinner** (STUDIO-147)
- **A more polished chat. A new thread opens on a welcome screen with four ways to start: build a block from a design, match a screenshot, ask what's in the project, or talk through a pull request. The message box grows as you write and shows the Enter and Shift+Enter keys; Send is a round button with a spinner while it sends. The agent's answers carry its >_ mark; while it works, a spinner shows how long it has taken. A thread shows placeholder lines while it opens. Motion stays off when the system asks for reduced motion** (STUDIO-137)

### Fixed
- **The review's conversation stays readable: a long request, such as a pasted CI log, folds to its first lines with Show all, in monospace when it reads like a log; and once a change has made its version, its running line goes instead of staying under it with the CLI's last hint. A change that failed says so, with its log** (STUDIO-244)
- **A draft's pull request no longer fails the project's own lint in CI: every new version runs through the project's `stylelint` and `eslint` with `--fix`, and what they can't fix shows as issues in the review. Engine aem-eds-kit 0.4.90** (STUDIO-240)
- **Accepting (or pushing a version of) a draft of a block that is already in `blocks/` failed with "Accept failed: (use -f to force removal)". Engine aem-eds-kit 0.4.89** (STUDIO-236)

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
