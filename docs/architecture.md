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
