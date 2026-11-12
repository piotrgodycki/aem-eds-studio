# Architecture

The agent runs inside `eds` (aem-eds-kit), which sets its task, tools and folder and checks what it wrote; the studio runs `eds` and keeps people in the review loop.

## Pieces

| Piece | Where | Responsibility |
|---|---|---|
| `eds` CLI | `aem-eds-kit` (npm) | generation, drafts, migration, checks, preview, publish |
| Studio server | this repo | projects, GitHub, workspaces, jobs, secrets, roles, review state |
| Studio UI | this repo | the screens for developers, managers and clients |

## Jobs

A job is one `eds` invocation in a project's workspace (a clone of the project's repository on its own branch):

1. The server checks out (or creates) the job's branch in the workspace.
2. It spawns `eds … --json` with the project's model and MCP settings; secrets are passed through the environment, never the command line.
3. It streams the JSON events to the UI (log, progress, files, cost).
4. The result is stored with the draft: version, files, preview, the comment that led to it.

### In this version

- **Server** (`src/server/`): Hono on Node, listening on 127.0.0.1.
  - `agent-auth.ts` signs an agent in with its provider's own login, in the background: `claude auth login` or `codex login` opens the provider's page in the browser and keeps the login; the studio shows the link and, if asked, passes back the code from that page. Only those two commands can run, and no terminal opens.
  - `jobs.ts` spawns `eds --json --no-color …`, collects the events and streams them to the UI over Server-Sent Events (`GET /api/jobs/:id/events`).
  - A generation round is stopped after 20 minutes. A preview job runs until another preview replaces it.
  - `eds.ts` finds the CLI (`EDS_BIN`, the bundled dependency, else `eds` on PATH) and refuses one older than `MIN_EDS_VERSION` (0.4.76).
  - `github.ts` takes the GitHub token from the studio's own sign-in, else `GITHUB_TOKEN` / `GH_TOKEN`, else `gh auth token`. `github-auth.ts` runs the sign-in: GitHub's device flow (`POST /api/github/connect` returns only the user code and the page; the device code and the token stay in the server), with the OAuth App's public Client ID (`STUDIO_GITHUB_CLIENT_ID` overrides it). Without a Client ID or a keychain, sign-in is off.
- **UI** (`src/web/`): React, built by Vite into `dist/web` and served by the same server. A side menu (projects, each project's Blocks and Work board, the draft under review, Guide, status) frames three full-width screens: projects, a project (`#/p/<id>`, its work board at `#/p/<id>/board`) and a draft (versions, preview, request changes, accept). The menu folds to icons (`sidebarCollapsed` in `settings.json`) and is a drawer on phones.
- **Desktop app** (`src/desktop/`, Electron):
  - `main.ts` starts the same server on a free 127.0.0.1 port and loads it in a window (single instance); design and preview links open in the system browser.
  - The window denies every permission except the studio's own clipboard write (`permissions.ts`); the UI is served with a Content Security Policy (scripts from the studio only, frames from the local block preview) and only files under its folder.
  - `preload.cts` is the page's only bridge to the app: `studioDesktop.pickFolder()` opens the native folder picker, `studioDesktop.update` reports and installs updates (the IPC handler answers only the studio's own origin).
  - `token-store.ts` keeps the sign-in token encrypted with the system keychain (Electron `safeStorage`) in `~/.aem-eds-studio/github-token.enc`; *Disconnect* deletes it. The keychain is touched only when that file exists or a token is saved (on macOS every access can ask the user).
  - `updates.ts` runs `electron-updater` against the GitHub releases; `release.ts` holds the parts it can test without Electron (signed build, installer link).
  - The bundled `eds` runs with the app's binary as Node: `ELECTRON_RUN_AS_NODE=1` is set for those children only, because Electron's own helper processes must not get it.
  - `env.ts` takes the login shell's PATH and the agents' own settings (`CLAUDE_*`, `ANTHROPIC_*`, `CODEX_*`, `OPENAI_*`, `CURSOR_*`, `OLLAMA_*`), since an app opened from the Dock gets neither.
  - An Edit menu and a right-click menu make text copyable.
  - `STUDIO_SMOKE=<file>` starts the app, runs a real `eds draft list`, writes a report and exits. CI runs it on each packaged build.
- **State:** `~/.aem-eds-studio/projects.json` holds the projects and their default models, `settings.json` the app's own settings (the tutorial was seen), and `workspaces/<owner>/<repo>` holds the GitHub clones. Drafts themselves live in each project's `tmp/eds-cli/drafts/`, which the CLI owns.

| Endpoint | Runs |
|---|---|
| `GET /api/agents` | `eds agents` (the tutorial's agent check) |
| `GET /api/setup` | The Setup window's checks: `eds` found, `git --version`, `eds agents`, GitHub connected, a Figma token set |
| `GET /api/projects/:id/drafts` | `eds draft list` |
| `POST /api/projects/:id/drafts` | `eds block from-design <link or export> --name <n> --draft [--agent] [--model]`; a Figma export is saved to `tmp/eds-cli/exports/<n>.<ext>` first |
| `POST …/drafts/:name/refine` | `eds draft refine [--from n] -- <name> "<comment>"` |
| `POST …/drafts/:name/preview` | `eds draft preview <name> [n] --no-open --port <free port>` |
| `POST …/drafts/:name/accept` | `eds draft accept <name> [n] --branch <b>` |
| `POST …/drafts/:name/discard` | `eds draft discard <name>` |

## Drafts and acceptance

- A draft lives outside `blocks/` until accepted; each review round is a new version.
- **Accept** copies the chosen version into `blocks/<name>/`, commits on the job's branch with the review history in the message, and opens a pull request. A developer merges it.
- **Discard** removes the draft; the repository is untouched.

## Models

| Provider | Where it runs | MCP |
|---|---|---|
| Claude API (Haiku / Sonnet / Opus) | server or desktop | yes, through the API's MCP connector |
| Claude Code / Cursor / Codex | the developer's machine | yes, through the agent's own config |
| Local (Ollama, oMLX, OpenAI-compatible) | the machine that runs it | no |

## What the studio can reach

The studio works only in the projects the user added: a folder they picked, or a GitHub repository it cloned for them.

- **Server.** Every file and git operation (drafts, previews, exports, accept, discard) runs in the folder of a registered project. Paths from the page are checked against it (`insideDir`). The API listens on 127.0.0.1 only, rejects other hosts and origins, and accepts writes as JSON only.
- **Agent.** The agent runs through `eds` in the project folder.
  - Since aem-eds-kit 0.4.76, Claude Code runs in `--restricted` mode: its file tools stay inside the project, with no shell or web. It writes only the block's folder and never reads secrets.
  - A local model never touches files: it sees what `eds` sends, and `eds` writes the answer.
  - Cursor and Codex have no such mode and can read any file the user can. `eds agents` reports this as `confined: false`. The studio labels them in the agent list, warns when one is chosen, and the Setup window prefers an agent that stays inside the project.

## Secrets

Per project: model API key, Figma token, AEM / DA credentials, MCP server auth. Stored encrypted on the server, handed to a job only through its environment, never sent to the browser or written into the repository.

## Open decisions

- Local first or hosted first; where the hosted version runs.
- Who pays for AI: the studio's key or the client's own.
- Sign-in beyond GitHub for clients without a GitHub account.
- The AEM MCP server to support first.
