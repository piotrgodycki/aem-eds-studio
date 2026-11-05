# aem-eds-studio

The app around [aem-eds-kit](https://github.com/piotrgodycki/aem-eds-kit): one place where **developers, managers and clients** turn designs into AEM Edge Delivery blocks, review them, and accept them into the project's repository.

`aem-eds-kit` (the `eds` CLI) stays the engine. The studio never re-implements generation, migration or checks; it runs `eds` as a tool and adds what a team needs around it.

## What it does

- **Projects from GitHub.** Sign in with GitHub, pick a repository (or start one from the latest EDS boilerplate), and the studio clones it into a workspace and detects the authoring model.
- **Pick the model.** A default per project, overridable per job: Claude through the API (Haiku, Sonnet, Opus), a local model (Ollama, oMLX, any OpenAI-compatible server) or, on a developer's machine, Claude Code / Cursor / Codex. Every job shows what it cost.
- **MCP servers.** Per project: AEM MCP (content, Content Fragments, assets), Figma MCP, or your own. They're handed to the agent, so blocks can be built from real AEM content.
- **Drafts, review rounds, acceptance.** Nothing reaches the repository until someone accepts it:

```text
design link (Figma / Framer / Stitch / page)
   │
   ▼
draft v1  ──►  preview link for the client / manager
   │                 │
   │      ┌──────────┴──────────┐
   │      ▼                     ▼
   │  "Change": a comment    "Accept"
   │      │                     │
   └── next round (v2, v3…)     ▼
                       commit on a branch + pull request
                       (a developer merges)
```

  A first version that's already right is accepted straight away; a rejected draft is dropped and the repository never changes.

- **Roles.**
  - **Developer:** everything: new project, design → block, AEM migration, checks, publish; can accept and commit directly.
  - **Manager:** migration report (what maps automatically, what needs manual work), quality dashboard (accessibility, visual regression, loading, security), progress; accepts or comments.
  - **Client:** paste a design link, see the block and how it compares with the design, then "Change" or "Accept".
- **Secrets stay server-side:** model API keys, Figma tokens, AEM / DA credentials live in a per-project vault, never in the repository or the client's browser.

## How it uses the CLI

Each job runs `eds` in its own process and reads its machine-readable output, so one client's job can't take the app down and every job can be limited in time and resources:

```text
studio                                       aem-eds-kit (npm)
  new job    ──spawn──►  eds block from-design <link> --draft --json
             ◄─────────  JSON events: progress, log, files, cost, result
  "Change"   ──spawn──►  eds draft refine hero "<comment>" --json
  "Accept"   ──spawn──►  eds draft accept hero --branch … --json
```

What the CLI still needs for this (tracked in aem-eds-kit): drafts (`--draft`, `eds draft refine | accept | discard | list`), `--agent api` (Claude through the API, with model choice and cost), `--mcp-server` passed to the agent, and a versioned `--json` event stream.

## Roadmap

1. **CLI groundwork** (in aem-eds-kit): drafts, `--agent api`, `--mcp-server`, `--json`.
2. **Studio, local first:** `npx aem-eds-studio` opens it in the browser; GitHub import, model choice, MCP config, roles, drafts with review rounds, accept → PR.
3. **Shareable reviews:** a link a client can open to review and accept.
4. **Hosted** (a business decision: where it runs, who pays for AI, sign-in, design confidentiality), and optionally a desktop wrapper of the same UI.

See [`docs/architecture.md`](docs/architecture.md).
