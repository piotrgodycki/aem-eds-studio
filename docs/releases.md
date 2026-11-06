# Releases and signing

## npm

`npm publish` from `main`. `prepublishOnly` runs lint, typecheck, the tests and the build first.

## Desktop installers

`.github/workflows/desktop.yml` runs on every pull request that touches the app and on `v*` tags:

1. It builds the app on `macos-latest` (`.dmg`, Apple Silicon and Intel) and `windows-latest` (`.exe` installer) with electron-builder.
2. It starts the packaged app in smoke mode (`STUDIO_SMOKE`). The check passes only if the server answers and the bundled `eds` runs `draft list`.
3. The installers are kept as workflow artifacts.
4. On a `v*` tag they are attached to a **draft** GitHub release.

To release:

```bash
npm version minor        # or patch; updates package.json and creates the v* tag
git push --follow-tags   # the workflow drafts the release; check it and publish it
```

## Signing (optional)

Without certificates the builds still work:
- macOS builds are ad-hoc signed;
- Windows builds are unsigned;
- the README tells users how to open them the first time.

Signing turns on when these repository secrets exist (*Settings → Secrets and variables → Actions*):

| Secret | What |
|---|---|
| `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` | "Developer ID Application" certificate as a base64 `.p12`, and its password (Apple Developer Program) |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | notarisation, so macOS opens the app without a warning |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Windows code-signing certificate (`.pfx`, base64), and its password |

The certificates never go into the repository.
