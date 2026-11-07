<p align="center">
  <img src="docs/assets/icon.png" width="96" height="96" alt="AEM EDS Studio">
</p>

<h1 align="center">AEM EDS Studio</h1>

<p align="center">
  Turn a design into an AEM Edge Delivery block, review it in rounds, accept it into the repo.<br>
  For developers, managers and clients. Desktop app for macOS and Windows.
</p>

<p align="center">
  <a href="https://github.com/piotrgodycki/aem-eds-studio/releases/latest/download/AEM-EDS-Studio-mac-arm64.dmg"><img alt="Download for macOS (Apple Silicon)" src="https://img.shields.io/badge/macOS-Apple%20Silicon-ff5a36?style=for-the-badge&logo=apple&logoColor=white"></a>
  <a href="https://github.com/piotrgodycki/aem-eds-studio/releases/latest/download/AEM-EDS-Studio-mac-x64.dmg"><img alt="Download for macOS (Intel)" src="https://img.shields.io/badge/macOS-Intel-1d1d1a?style=for-the-badge&logo=apple&logoColor=white"></a>
  <a href="https://github.com/piotrgodycki/aem-eds-studio/releases/latest/download/AEM-EDS-Studio-win-x64.exe"><img alt="Download for Windows" src="https://img.shields.io/badge/Windows-x64-1d1d1a?style=for-the-badge&logo=windows&logoColor=white"></a>
</p>

<p align="center">
  <a href="https://github.com/piotrgodycki/aem-eds-studio/releases"><img alt="Release" src="https://img.shields.io/github/v/release/piotrgodycki/aem-eds-studio?color=ff5a36"></a>
  <a href="https://github.com/piotrgodycki/aem-eds-studio/actions/workflows/desktop.yml"><img alt="Desktop build" src="https://github.com/piotrgodycki/aem-eds-studio/actions/workflows/desktop.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/aem-eds-kit"><img alt="Engine: aem-eds-kit" src="https://img.shields.io/npm/v/aem-eds-kit?label=engine%20aem-eds-kit&color=1d1d1a"></a>
</p>

![A draft under review: the preview fills the window, versions as tabs, device switch, request changes and accept in the side panel](docs/assets/review.png)

## How it works

Nothing reaches the repository until someone accepts it.

| | |
|---|---|
| **1. Add a project**<br>A GitHub repository (cloned for you) or an Edge Delivery folder on your disk, chosen in the system's folder picker. | ![Projects](docs/assets/projects.png) |
| **2. New block from a design**<br>Paste a Figma, Framer, Stitch or any page link, name the block, pick the agent and model. The log shows each step and what it cost. | ![New block](docs/assets/new-block.png) |
| **3. Review on every device**<br>The preview fills the window, with tabs for the versions and *Desktop / Tablet / Mobile*. The review panel folds away. *Request changes* sends a comment, and the agent makes the next version. | ![Devices](docs/assets/devices.png) |
| **4. Full screen, then accept**<br>Check it full screen or in your browser. *Accept* commits only `blocks/<name>/` on a branch, with the review rounds in the commit message. *Discard* drops the draft. | ![Full screen](docs/assets/full-screen.png) |
| **5. Work board**<br>The project's GitHub issues and pull requests by who acts next: prepared, in progress, dev review, QA (with the PR's screenshot), done. Filter by developer, QA or manager. | ![Work board](docs/assets/board.png) |

### Also in the app

- **Several projects at once.** Different blocks and projects generate in parallel; work on the same block queues. The header lists every running and queued job.
- **Project settings import and export.** A `.studio.json` file (repository, default agent and model, no secrets) to share a setup with the team.
- **In-app updates.** See [Install](#install).
- **Connect GitHub** from the header, with a code you confirm on github.com (see below).

## Install

1. Download the installer for your system using the buttons above, or from [Releases](https://github.com/piotrgodycki/aem-eds-studio/releases).
2. **macOS:** open the `.dmg` and drag the app to Applications. **Windows:** run the `.exe`. It installs for the current user.
3. **First launch of an unsigned build:**
   - **macOS:** *System Settings → Privacy & Security → Open Anyway*.
   - **Windows:** *More info → Run anyway*.
4. **Updates come to the app.** It checks for a new release at start and every few hours, downloads it in the background and shows *Restart to update* in the header. On macOS, until the builds are signed, the button downloads the new `.dmg` instead.

**You need**
- An agent: Claude Code, Cursor, Codex, or a local model through Ollama / oMLX.
- `git`, to accept drafts.

**You don't need**
- Node. The app has its own runtime and the [aem-eds-kit](https://www.npmjs.com/package/aem-eds-kit) engine inside.

**GitHub projects.** Sign in with `gh auth login` or set `GITHUB_TOKEN`. The token never leaves your machine. *Connect GitHub* in the header (the app shows a code, you confirm it on github.com, the token goes to your system keychain) switches on once the app's GitHub sign-in is registered.

## Who it's for

| Role | Does |
|---|---|
| **Developer** | Everything: projects, generation, review, accept. |
| **Manager** | Reviews drafts, requests changes, accepts. |
| **Client** | Pastes a design link, then requests changes or accepts. |

## Under the hood

- **The engine is the CLI.** Every action runs `eds … --json` from [aem-eds-kit](https://github.com/piotrgodycki/aem-eds-kit) and streams its events. Nothing is re-implemented in the studio.
- **Local and safe.**
  - The server listens on `127.0.0.1` only and refuses other hosts and origins.
  - Commands run without a shell, with validated arguments.
  - Secrets never reach the repository or the window.
- **Docs:** [architecture](docs/architecture.md), [releases and signing](docs/releases.md), [changelog](CHANGELOG.md).

## From source

```bash
git clone https://github.com/piotrgodycki/aem-eds-studio && cd aem-eds-studio
npm install
npm run desktop            # build and open the app
```

| Command | What it does |
|---|---|
| `npm run dev:server` / `npm run dev:web` | API on :4600, UI with hot reload |
| `npm run lint && npm run typecheck && npm test` | checks; tests use a fake `eds`, so no agent runs |
| `npm run dist:mac` / `dist:win` | installers in `release/` |

## Roadmap

- **Done (0.3.0):** projects, drafts with review rounds on three devices, accept onto a branch, work board, several projects at once, settings import/export, in-app updates.
- **Next:**
  - a first-run tutorial;
  - a pull request after accept, with the three device screenshots for QA;
  - Claude through the API (no local agent needed);
  - MCP servers per project (AEM, Figma);
  - roles;
  - shareable review links.

## License

MIT © Piotr Godycki
