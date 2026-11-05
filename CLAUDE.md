# aem-eds-studio: working rules

- **The CLI is the engine.** Generation, drafts, migration and checks live in `aem-eds-kit` (`eds`); the studio runs it as a tool (`--json`) and never re-implements it. A missing CLI capability is an issue in aem-eds-kit, not a workaround here.
- **One issue, one branch, one PR.** Open a GitHub issue `STUDIO-NNN: …` (NNN = the issue number), work on `feature/STUDIO-NNN` or `bug/STUDIO-NNN`, open a PR with `Fixes #NNN`, merge it (merge commit) once CI is green.
- **Every change updates the docs in the same PR:** `README.md` and `docs/`, plus a `CHANGELOG.md` entry once the app ships.
- **Secrets never reach the repository or the browser.**
- Commits are authored as Piotr Godycki, with no `Co-Authored-By` trailer.
