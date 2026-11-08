# Changelog

All notable changes to aem-eds-studio. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **No keychain prompt at every launch on macOS** (STUDIO-46): the app reads
  the system keychain only when a GitHub token was saved in it, and writes to
  it only when you connect GitHub.

## [0.4.0] - 2026-11-08

### Changed
- **aem-eds-kit 0.4.63** (STUDIO-43) is bundled and required: its `eds agents`
  is what the first-run tutorial's agent step lists.
- **One-click releases** (STUDIO-41): *Actions → Release → Run workflow*
  (patch / minor / major) bumps the version and the CHANGELOG through a PR it
  merges itself, builds and smoke-tests the installers, and publishes the
  release. No version PR or tag by hand.
- **Full width, with a side menu** (STUDIO-39): the app uses the whole window.
  A side menu lists every project (with its Blocks, Work board and the draft
  under review), the Guide and the status (update, jobs, eds, GitHub); it
  folds to icons and is remembered. On a phone it opens from the menu button
  as a drawer.

### Fixed
- **Copying text in the desktop app** (STUDIO-37): an Edit menu (⌘C / Ctrl+C,
  paste, select all), a right-click menu, and *Copy log* on every job log.
- **"Not logged in" from the agent** (STUDIO-37): the app now takes the
  agents' own settings from the login shell along with PATH (e.g.
  `CLAUDE_CONFIG_DIR`), and when an agent really isn't signed in it says so,
  with *Sign in to Claude Code* / *Codex*: a terminal opens with the agent's
  own sign-in (your account, no API key).

### Added
- **First-run tutorial** (STUDIO-17): on the first launch, a short guide:
  which agents are installed and signed in (from `eds agents`, with how to
  install or sign in with your account, no API key), adding a project, the
  first block from the sample design, and reviewing on three devices. *Guide*
  in the header opens it again; finishing or skipping it is remembered in the
  studio's settings.

### Changed
- **README says how the studio and aem-eds-kit fit together** (STUDIO-34):
  the engine and the desktop app, linked both ways.
- **Release from Actions** (STUDIO-33): *Desktop → Run workflow* with a
  version checks `package.json`, builds and smoke-tests the installers and
  drafts the release with its CHANGELOG section; no tag to push by hand.

## [0.3.0] - 2026-11-07

Updates itself from now on: install 0.3.0 once by hand, later versions arrive
in the app.

### Added
- **Connect GitHub** (STUDIO-28): sign in from the app with GitHub's device
  flow (a code confirmed on github.com, no client secret). The token is kept
  in the system keychain and never reaches the page; *Disconnect* removes it.
  `GITHUB_TOKEN` and `gh` still work. Off until the OAuth App's Client ID is set.
- **In-app updates** (STUDIO-26): the app checks the latest published release
  at start and every 4 hours, downloads it in the background and offers
  *Restart to update*. An unsigned macOS build offers the new `.dmg` instead,
  since macOS only lets a signed app replace itself.
- **Choose a local folder** (STUDIO-24): the desktop app opens the system's
  folder picker; pasting a path stays as a fallback (and in a plain browser).
- **Project settings import and export** (STUDIO-20): a `.studio.json` file
  (repository, default agent and model, no secrets); import clones or updates.
- **Several projects at once** (STUDIO-20): different blocks and projects run in
  parallel; the same block queues; accept (git) has the project to itself;
  first come, first served; a header shows every running and queued job.
- **Work board** (STUDIO-18): the project's GitHub issues and PRs by who acts
  next (prepared, in progress, dev review, QA, done), with CI, the aem.page
  preview, the PR's screenshot for QA and role filters.
- **Devices and a collapsible review panel** (STUDIO-15): desktop, tablet and
  mobile previews scaled to fit and sized to the block; the panel folds into a
  rail and is remembered.

### Changed
- **aem-eds-kit 0.4.62** (STUDIO-22) is bundled and required: it reports the
  preview's height, which the device frames size to, and puts block
  backgrounds on the section, so no white areas around blocks.
- **README** (STUDIO-13, STUDIO-30): logo, download buttons, the flow in screenshots (devices, work board),
  shorter sections.

## [0.2.0] - 2026-11-06

First release, as a desktop app for macOS and Windows.

### Added
- **Projects** from GitHub (cloned into `~/.aem-eds-studio/workspaces/`) or a
  local folder, with a default agent and model per project (STUDIO-1).
- **Drafts with review rounds:** a new block from a design link (or the
  sample) as a draft, a live log of the agent's steps and the round's cost, a
  preview per version, "Request changes" for the next version, accept onto a
  branch (only `blocks/<name>/`, with the rounds in the commit message) or
  discard (STUDIO-1).
- **Local-only server:** 127.0.0.1, no foreign hosts or cross-origin writes,
  validated arguments, no shell, the GitHub token kept out of argv and the
  browser (STUDIO-1).
- **The engine is bundled:** aem-eds-kit 0.4.61+ is a dependency, found
  through Node's module resolution (STUDIO-3).
- **Desktop app only** (STUDIO-9): the studio isn't published on npm
  (`private`); aem-eds-kit is the one npm package and comes inside the app.
- **Desktop app for macOS and Windows** (STUDIO-5): the same server and UI in
  an Electron window, as a `.dmg` (Apple Silicon and Intel) and a Windows
  installer, built and smoke-tested on real macOS and Windows runners and
  attached to a draft GitHub release on a `v*` tag. It needs no Node: the
  bundled `eds` runs with the app's own runtime, and agents are found on the
  login shell's PATH. Signing and notarisation switch on with repository
  secrets (`docs/releases.md`).

### Changed
- **The aem-eds-kit look** (STUDIO-7): always dark (the site's ink, paper and
  accent), Geist and Geist Mono bundled for offline use, the `>_` mark and
  wordmark with the site's hover, its buttons, mono labels, and one set of
  line icons.
- **Draft review fills the window** (STUDIO-7): the preview takes the whole
  window under a slim bar with the versions as tabs; *Full screen*, *Open in
  browser* and *Hide review*; requesting changes and accepting move to a side
  panel.

[Unreleased]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.0...main
[0.4.0]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/piotrgodycki/aem-eds-studio/releases/tag/v0.2.0
