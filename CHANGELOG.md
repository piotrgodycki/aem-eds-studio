# Changelog

All notable changes to aem-eds-studio. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/piotrgodycki/aem-eds-studio/commits/main
