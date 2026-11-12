<p align="center">
  <img src="docs/assets/icon.png" width="96" height="96" alt="AEM EDS Studio">
</p>

<h1 align="center">AEM EDS Studio</h1>

<p align="center">
  The desktop studio for aem-eds-kit: your AI agent turns a design into an AEM Edge Delivery block,<br>
  people review it in rounds and accept it into the repo. For developers, managers and clients. macOS and Windows.
</p>

<p align="center">
  <a href="https://piotrgodycki.github.io/aem-eds-kit/#studio"><img alt="Download for macOS (Apple Silicon)" src="https://img.shields.io/badge/macOS-Apple%20Silicon-ff5a36?style=for-the-badge&logo=apple&logoColor=white"></a>
  <a href="https://piotrgodycki.github.io/aem-eds-kit/#studio"><img alt="Download for macOS (Intel)" src="https://img.shields.io/badge/macOS-Intel-1d1d1a?style=for-the-badge&logo=apple&logoColor=white"></a>
  <a href="https://piotrgodycki.github.io/aem-eds-kit/#studio"><img alt="Download for Windows" src="https://img.shields.io/badge/Windows-x64-1d1d1a?style=for-the-badge&logo=windows&logoColor=white"></a>
</p>

<p align="center">
  <a href="https://github.com/piotrgodycki/aem-eds-studio/releases"><img alt="Release" src="https://img.shields.io/github/v/release/piotrgodycki/aem-eds-studio?color=ff5a36"></a>
  <a href="https://github.com/piotrgodycki/aem-eds-studio/actions/workflows/desktop.yml"><img alt="Desktop build" src="https://github.com/piotrgodycki/aem-eds-studio/actions/workflows/desktop.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/aem-eds-kit"><img alt="Engine: aem-eds-kit" src="https://img.shields.io/npm/v/aem-eds-kit?label=engine%20aem-eds-kit&color=1d1d1a"></a>
</p>

![A draft under review: the preview fills the window, versions as tabs, device switch, request changes and accept in the side panel](docs/assets/review.png)

The engine is **[aem-eds-kit](https://github.com/piotrgodycki/aem-eds-kit)**, which runs the agent you already use (Claude Code, Codex, Cursor or a local model). The studio bundles its `eds` CLI, runs it for every step and adds the part for people: projects, review on three devices, rounds of changes, acceptance onto a branch and a work board. New capabilities land in the kit first.

## Features

- **Projects** from GitHub or a local folder; several at once.
- **New block from a design** (Figma, Framer, Stitch, any page) with your agent; live log and cost. Figma through REST, MCP or a PNG/SVG export (no API call, for free Figma plans).
- **Review** on desktop, tablet and mobile; request changes; accept onto a branch.
- **Work board:** the project's issues and PRs by who acts next.
- **Setup** window: what is missing (engine, Git, agent, GitHub) and how to fix it.
- **Settings** and **History** in the corner of the sidebar: GitHub, the Figma token (kept in the system keychain), the engine; the open project's commits, with the blocks accepted in the studio marked.
- **Usage:** each plan's limits as the agent reports them (Claude Code's 5-hour and weekly windows: percent, reset time) and the tokens of the studio's runs, today, 7 and 30 days.
- **Only the chosen project:** the studio works in the projects you add, and runs only agents kept inside them (Claude Code, Codex in an OS sandbox on macOS/Linux, local models).
- **Guide** on first launch; settings import / export; in-app updates.

Nothing reaches the repository until someone accepts it.

## Install

Download from the [site](https://piotrgodycki.github.io/aem-eds-kit/#studio) or [Releases](https://github.com/piotrgodycki/aem-eds-studio/releases). Unsigned builds: *Open Anyway* (macOS) / *Run anyway* (Windows) on first launch. You need an agent signed in with your account and `git`; no Node.

## Tech stack

| | |
|---|---|
| App | Electron, electron-builder, electron-updater |
| UI | React 19, Vite, Geist |
| Server | Hono on Node, 127.0.0.1 only |
| Engine | aem-eds-kit (`eds --json`) |
| Language, test, lint | TypeScript 7, Vitest, Biome 2 |
| CI / release | GitHub Actions (macOS + Windows builds, smoke test, one-click Release) |

## Development

```bash
npm install
npm run desktop                                   # build and open the app
npm run dev:server   # + npm run dev:web          # API on :4600, UI with hot reload
npm run lint && npm run typecheck && npm test     # tests use a fake eds
```

Docs: [architecture](docs/architecture.md), [releases](docs/releases.md), [changelog](CHANGELOG.md).

## License

MIT © Piotr Godycki
