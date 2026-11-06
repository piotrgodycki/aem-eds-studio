# Changelog

All notable changes to aem-eds-studio. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Desktop app for macOS and Windows** (STUDIO-5): the same server and UI in
  an Electron window, as a `.dmg` (Apple Silicon and Intel) and a Windows
  installer, built and smoke-tested on real macOS and Windows runners and
  attached to a draft GitHub release on a `v*` tag. It needs no Node: the
  bundled `eds` runs with the app's own runtime, and agents are found on the
  login shell's PATH. Signing and notarisation switch on with repository
  secrets (`docs/releases.md`).

## [0.1.0] - 2026-11-06

First release: the studio, run locally with `npx aem-eds-studio`.

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
- **The engine is bundled:** aem-eds-kit 0.4.60+ is a dependency, so
  `npx aem-eds-studio` needs nothing else installed (STUDIO-3).

[Unreleased]: https://github.com/piotrgodycki/aem-eds-studio/commits/main
[0.1.0]: https://www.npmjs.com/package/aem-eds-studio/v/0.1.0
