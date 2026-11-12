# Releases and signing

The studio ships only as the desktop app; `package.json` is `private`, so it can't be published to npm. aem-eds-kit is the npm package, and the app bundles it.

## Desktop installers

`.github/workflows/desktop.yml` runs on every pull request that touches the app and on `v*` tags:

1. It builds the app on `macos-latest` (`.dmg`, Apple Silicon and Intel) and `windows-latest` (`.exe` installer) with electron-builder.
2. It starts the packaged app in smoke mode (`STUDIO_SMOKE`). The check passes only if the server answers and the bundled `eds` runs `draft list`.
3. The installers are kept as workflow artifacts.
4. On a `v*` tag they are attached to a **draft** GitHub release.

The installer names carry no version (`AEM-EDS-Studio-mac-arm64.dmg`, `…-mac-x64.dmg`, `…-win-x64.exe`), so a download link to `https://github.com/piotrgodycki/aem-eds-studio/releases/latest/download/<name>` always gives the newest published release (drafts and pre-releases don't count). The aem-eds-kit site's download section uses these links.

To release, use **Actions → Release → Run workflow**, choose `patch`, `minor` or `major`, and run it. One run does everything:

1. It raises the version in `package.json`, moves the CHANGELOG's *Unreleased* section under `[x.y.z] - <date>` with its compare links (`scripts/changelog-release.mjs`), and lands that on `main`. `main` takes changes only through pull requests, so the workflow opens the PR *Release vx.y.z* and merges it itself; none needs an approval.
2. It calls the Desktop workflow on that commit: the installers are built and smoke-tested on macOS and Windows.
3. It publishes the release `vx.y.z`, which creates the tag. The notes are the CHANGELOG section, and the installers and updater files are attached. Installed apps update to it. To check a release before it goes out, tick *Keep the release as a draft* and publish it by hand.

One repository setting is needed once: **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**. Without it the run stops at step 1 and says so.

*Unreleased* has to hold something; the run stops if there's nothing to release. The Desktop workflow still runs on its own: *Run workflow* with a version already in `package.json`, or a pushed `v*` tag, makes a draft release. Pull requests only build.

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

## GitHub sign-in

*Connect GitHub* uses an OAuth App with **Device Flow** enabled (github.com → Settings → Developer settings → OAuth Apps; homepage and callback URL can both be the repository URL, the device flow doesn't use the callback). Its Client ID is public: put it in `BUILT_IN_CLIENT_ID` in `src/server/github-auth.ts`. There is no client secret. Until it is set, the app hides the button; people paste a token in Settings or use `GITHUB_TOKEN` or `gh`; `STUDIO_GITHUB_CLIENT_ID` overrides it for testing.
