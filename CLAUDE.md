# aem-eds-studio: working rules

- **The CLI is the engine.** Generation, drafts, migration and checks live in `aem-eds-kit` (`eds`); the studio runs it as a tool (`--json`) and never re-implements it. A missing CLI capability is an issue in aem-eds-kit, not a workaround here.
- **One issue, one branch, one PR.** Open a GitHub issue `STUDIO-NNN: …` (NNN = the issue number), work on `feature/STUDIO-NNN` or `bug/STUDIO-NNN`, open a PR with `Fixes #NNN`, merge it (merge commit) once CI is green.
- **Every change updates the docs in the same PR:** `README.md` and `docs/`, plus a `CHANGELOG.md` entry once the app ships.
- **Secrets never reach the repository or the browser.**
- **Propose before building.** For a change asked for in chat, first show it (a mockup or a screenshot of the running app, or the text), ask, and build only after a yes. Bugs with one obvious fix are the exception.
- **Everything in the repository is in English:** code, UI, docs, commits, issues and pull requests, whatever language the request was in.
- **Never delete branches and never force-push.** Bring `main` into a branch with a merge commit.
- **pnpm only** (`pnpm-lock.yaml`); no `npm install`.
- **Examples use the studio's own names:** ticket key `STUDIO`, branches `feature/STUDIO-1`, `bug/STUDIO-2`; never a client's project.
- **Plain punctuation in what users read:** full stops and commas, no semicolons.
- **Leave the code cleaner than you found it.** A change removes what it makes unused (functions, files, styles, flags, dependencies) instead of leaving it behind. Comments say *why*, in a sentence or two; drop ones that repeat the code. Write for the next developer: plain names, small functions, no clever tricks, so someone new can follow it without a tour.
- **No em dashes** in anything written (UI, docs, comments, commits): a colon, comma or full stop instead. `pnpm run lint` checks.
- Commits are authored as Piotr Godycki, with no `Co-Authored-By` trailer.
