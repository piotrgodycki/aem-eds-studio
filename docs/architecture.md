# Architecture

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
  - `jobs.ts` spawns `eds --json --no-color …`, collects the events and streams them to the UI over Server-Sent Events (`GET /api/jobs/:id/events`).
  - A generation round is stopped after 20 minutes. A preview job runs until another preview replaces it.
  - `eds.ts` finds the CLI (`EDS_BIN`, the bundled dependency, else `eds` on PATH) and refuses one older than 0.4.61.
- **UI** (`src/web/`): React, built by Vite into `dist/web` and served by the same server. There are three screens: projects, a project (new block, drafts, settings) and a draft (versions, preview, request changes, accept).
- **Desktop app** (`src/desktop/`, Electron):
  - `main.ts` starts the same server on a free 127.0.0.1 port and loads it in a window (single instance); design and preview links open in the system browser.
  - `preload.cts` is the page's only bridge to the app: `studioDesktop.pickFolder()` opens the native folder picker (the IPC handler answers only the studio's own origin).
  - The bundled `eds` runs with the app's binary as Node: `ELECTRON_RUN_AS_NODE=1` is set for those children only, because Electron's own helper processes must not get it.
  - `env.ts` adds the login shell's PATH, since an app opened from the Dock doesn't get it.
  - `STUDIO_SMOKE=<file>` starts the app, runs a real `eds draft list`, writes a report and exits. CI runs it on each packaged build.
- **State:** `~/.aem-eds-studio/projects.json` holds the projects and their default models, and `workspaces/<owner>/<repo>` holds the GitHub clones. Drafts themselves live in each project's `tmp/eds-cli/drafts/`, which the CLI owns.

| Endpoint | Runs |
|---|---|
| `GET /api/projects/:id/drafts` | `eds draft list` |
| `POST /api/projects/:id/drafts` | `eds block from-design <link> --name <n> --draft [--agent] [--model]` |
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

## Secrets

Per project: model API key, Figma token, AEM / DA credentials, MCP server auth. Stored encrypted on the server, handed to a job only through its environment, never sent to the browser or written into the repository.

## Open decisions

- Local first or hosted first; where the hosted version runs.
- Who pays for AI: the studio's key or the client's own.
- Sign-in beyond GitHub for clients without a GitHub account.
- The AEM MCP server to support first.
