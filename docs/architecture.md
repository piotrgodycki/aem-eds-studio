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

- **Server** (`src/server/`): Hono on Node, listening on 127.0.0.1. With Network access on (Settings, off by default), the same app also listens on every interface at port 4610 (`STUDIO_NETWORK_PORT`), for paired devices only (`devices.ts`).
  - `agent-auth.ts` signs an agent in with its provider's own login, in the background: `claude auth login` or `codex login` opens the provider's page in the browser and keeps the login; the studio shows the link and, if asked, passes back the code from that page. Only those two commands can run, and no terminal opens.
  - `jobs.ts` spawns `eds --json --no-color …`, collects the events and streams them to the UI over Server-Sent Events (`GET /api/jobs/:id/events`).
  - A generation round is stopped after 20 minutes. A preview job runs until another preview replaces it.
  - `eds.ts` finds the CLI (`EDS_BIN`, the bundled dependency, else `eds` on PATH) and refuses one older than `MIN_EDS_VERSION` (0.4.83).
  - `github.ts` takes the GitHub token the user gave the studio (Connect GitHub, or a token pasted in Settings), never one another tool left in the shell; only the browser mode, which has no keychain, reads `GITHUB_TOKEN` / `GH_TOKEN`. `github-auth.ts` runs the sign-in: GitHub's device flow (`POST /api/github/connect` returns only the user code and the page; the device code and the token stay in the server), with the GitHub App's public Client ID (`STUDIO_GITHUB_CLIENT_ID` overrides it). Without a keychain, sign-in is off. The app reaches only the repositories the user installed it on, so `GET /api/github/repos` lists those (`/user/installations`), and `/api/status` gives the page where the user changes the pick. Its tokens expire after 8 hours; the keychain keeps the refresh token too, and the server renews the token before it runs out (one refresh at a time).
- **UI** (`src/web/`): React, built by Vite into `dist/web` and served by the same server. A side menu (projects, the open project's chat threads, the draft under review, Guide, status) frames three full-width screens: projects, a project (`#/p/<id>`, with the tabs Chat, Blocks `#/p/<id>/blocks`, Drafts `#/p/<id>/drafts` and Work board `#/p/<id>/board`: GitHub's pull requests and issues from `GET …/board`, plus the studio's running jobs and open drafts from `GET …/jobs` and `GET …/drafts`, read again every few seconds while a job runs, and Agents `#/p/<id>/agents/<job>`: the project's jobs from `GET …/jobs` with the picked one's live log from `GET /api/jobs/:id/events`) and a draft (versions, preview, request changes, accept). The menu folds to icons (`sidebarCollapsed` in `settings.json`) and is a drawer on phones.
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
- **State:** `~/.aem-eds-studio/projects.json` holds the projects and their default models, `settings.json` the app's own settings (the tutorial was seen, the folded menu, and the switches in Settings: `github` and `autoUpdates`, each on unless set to `false`; `isOn()` in `settings.ts`), and `workspaces/<owner>/<repo>` holds the GitHub clones. Drafts themselves live in each project's `tmp/eds-cli/drafts/`, which the CLI owns.

| Endpoint | Runs |
|---|---|
| `GET /api/agents` | `eds agents` (the tutorial's agent check) |
| `PUT /api/github/token` | A GitHub token pasted in Settings: checked with `GET /user`, then kept in the keychain like the device flow's token; never read back |
| `GET/PUT/DELETE /api/settings/figma` | The Figma token from Settings: saved to the keychain, handed to jobs as `FIGMA_TOKEN`, never read back by the page |
| `GET /api/usage` | The Usage window: plan limits and token totals, from the `agent-result` events kept in `usage.jsonl` |
| `GET/POST /api/projects/:id/chats`, `GET/DELETE …/chats/:thread` | The project's chat (`chat.ts`): threads in `~/.aem-eds-studio/chats/<project>.json`. The list gives each thread `working` (an answer is running or messages wait) and `answeredAt` (its latest answer), for the side menu's spinner and new-answer dot. A message runs `eds ask --input <file>` (one read-only turn; the file holds the earlier turns and the attachments: a pull request's title, description and diff, quotes from any thread, other threads' recent turns, and pasted files: images and text files are saved in the project's `tmp/eds-cli/chat/<thread>/`, where the confined agent may read them, and images go in as that path). A message sent while a turn runs waits; when the turn ends, all waiting messages go in the next one. `GET …/chats/:thread/files/:file` serves a thread's PNG, JPEG, WebP or GIF to the page (never SVG); the answer and any proposed action are saved when the job ends. The page runs a proposed action only after the user's yes |
| `GET /api/projects/:id/history` | `git log` in the project (the History window) |
| `GET /api/projects/:id/pulls` | The repository's latest 50 pull requests with a status (open, draft, merged, closed) for the sidebar's Pull requests section; `pulls` is null without a GitHub repository or access |
| `GET /api/setup` | The checks on Settings' Setup tab: `eds` found, `git --version`, `eds agents`, GitHub connected, a Figma token set |
| `GET /api/projects/:id/drafts` | `eds draft list` |
| `POST /api/projects/:id/drafts` | `eds block from-design <link or export> --name <n> --draft [--agent] [--model]`; a Figma export is saved to `tmp/eds-cli/exports/<n>.<ext>` first |
| `POST …/drafts/:name/refine` | `eds draft refine [--from n] -- <name> "<comment>"`; for a block with no draft, eds starts one from the block |
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
- **Network access** (STUDIO-141).
  - **Pairing:** a device pairs with a one-time code from `POST /api/network/pair-code` (128 random bits, 5 minutes, used once, kept in memory) through `POST /api/pair`.
  - **Device token:** it lives in an HttpOnly, SameSite=Strict cookie. `~/.aem-eds-studio/devices.json` keeps only its SHA-256, and the lookup compares in constant time. Another site's page can't send the cookie, and writes still need the same origin and JSON.
  - **What a device may call:** only `DEVICE_ROUTES` in `app.ts`: reading, the chat, starting or refining a draft, and stopping a job. Settings, tokens, projects, accept and discard, and device management answer 403 on the network listener.
  - **Revoking:** `DELETE /api/network/devices/:id` shuts a device out at once.
  - **The page** (STUDIO-143, `Pairing.tsx`):
    - The pairing link `#/pair/<code>` asks the device for a name and pairs it; the code stays in the hash, so it never reaches a server log.
    - A 401 shows how to pair.
    - `GET /api/device` tells the page it runs on a paired device. The page then leaves out what only the computer may do (`useOnComputer`: add, import and project settings, accept and discard, and Settings beyond "This device"), and it no longer saves settings from the device.
    - **Tailscale HTTPS** (STUDIO-145, `tailscale.ts`): `tailscale serve --bg --https=443 http://127.0.0.1:4610` from Settings (`POST /api/network/tailscale`, computer only). The studio runs Tailscale's CLI and never handles a certificate. Behind that proxy, the guard takes the host and scheme from `X-Forwarded-Host` / `X-Forwarded-Proto`, but only from a loopback peer (`seenBy`), so a device on the network can't claim another origin.
    - Settings → Network access on the computer draws the QR code as SVG squares, with no image or HTML string, offers one link per address (LAN, plus Tailscale's 100.64.0.0/10), and lists the paired devices.
- **Agent.** The agent runs through `eds` in the project folder, and the studio always sets `EDS_CONFINED_ONLY=1`, so `eds` refuses an agent it can't keep inside the project.
  - Claude Code runs in its `--restricted` mode (aem-eds-kit 0.4.76+): its file tools stay inside the project, with no shell or web, and it writes only the block's folder.
  - Codex runs in an OS sandbox (macOS `sandbox-exec`, Linux bubblewrap) that hides the home folder except the project and `~/.codex`.
  - A local model never touches files: it sees what `eds` sends, and `eds` writes the answer.
  - Cursor, and Codex on Windows, can't be kept inside the project. `eds agents` reports them as `confined: false`; the agent list greys them out and Settings' Setup tab says why.

## Secrets

Per project: model API key, Figma token, AEM / DA credentials, MCP server auth. Stored encrypted on the server, handed to a job only through its environment, never sent to the browser or written into the repository.

## Open decisions

- Local first or hosted first; where the hosted version runs.
- Who pays for AI: the studio's key or the client's own.
- Sign-in beyond GitHub for clients without a GitHub account.
- The AEM MCP server to support first.
