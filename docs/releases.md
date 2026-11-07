# Releases and signing

The studio ships only as the desktop app; `package.json` is `private`, so it can't be published to npm. aem-eds-kit is the npm package, and the app bundles it.

## Desktop installers

`.github/workflows/desktop.yml` runs on every pull request that touches the app and on `v*` tags:

1. It builds the app on `macos-latest` (`.dmg`, Apple Silicon and Intel) and `windows-latest` (`.exe` installer) with electron-builder.
2. It starts the packaged app in smoke mode (`STUDIO_SMOKE`). The check passes only if the server answers and the bundled `eds` runs `draft list`.
3. The installers are kept as workflow artifacts.
4. On a `v*` tag they are attached to a **draft** GitHub release.

The installer names carry no version (`AEM-EDS-Studio-mac-arm64.dmg`, `…-mac-x64.dmg`, `…-win-x64.exe`), so a download link to `https://github.com/piotrgodycki/aem-eds-studio/releases/latest/download/<name>` always gives the newest published release (drafts and pre-releases don't count). The aem-eds-kit site's download section uses these links.

To release (`main` accepts changes only through pull requests, so the version change goes through one too):

1. In a PR (`STUDIO-NNN: release x.y.z`), run `npm version minor --no-git-tag-version` (or `patch`), which changes `package.json` and the lockfile. Move the CHANGELOG's Unreleased section under `[x.y.z]`, then merge.
2. Tag the merged `main` and push only the tag:

   ```bash
   git checkout main && git pull
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```
3. The Desktop workflow builds and smoke-tests the installers and drafts the release. Check the draft and publish it.

## In-app updates

Publishing the release is what installed apps update to. With the installers, the workflow attaches what `electron-updater` reads: `latest.yml` (Windows), `latest-mac.yml` and the `.zip` builds (macOS), and the blockmaps for partial downloads. The app (`src/desktop/updates.ts`) checks the latest published release (drafts and pre-releases don't count) 10 seconds after start and every 4 hours. It downloads in the background and shows *Restart to update*; an update it has downloaded also installs when the app quits.

- **Windows** updates in place, signed or not.
- **macOS** updates in place only when the build is signed with a Developer ID: Squirrel.Mac refuses to install anything else. The workflow marks a signed build (`studioSigned` in the packaged `package.json`); an unsigned one shows *Download x.y.z*, which opens the new `.dmg`.
- The repository is public, so the updater needs no token.
- Apps from before 0.3.0 have no updater: install 0.3.0 once by hand.

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
