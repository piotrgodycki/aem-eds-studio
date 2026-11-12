# Releases and signing

The studio ships only as the desktop app; `package.json` is `private`, so it can't be published to npm. aem-eds-kit is the npm package, and the app bundles it.

## Desktop installers

`.github/workflows/desktop.yml` runs on every pull request that touches the app and on `v*` tags:

1. It builds the app on `macos-latest` (`.dmg`, Apple Silicon and Intel) and `windows-latest` (`.exe` installer) with electron-builder.
2. It starts the packaged app in smoke mode (`STUDIO_SMOKE`). The check passes only if the server answers and the bundled `eds` runs `draft list`.
3. The installers are kept as workflow artifacts.
4. On a `v*` tag they are attached to a **draft** GitHub release.

The macOS builds here are ad-hoc signed; a release's macOS app is signed and notarised on the maintainer's Mac (see *Signing the macOS app*).

The installer names carry no version (`AEM-EDS-Studio-mac-arm64.dmg`, `…-mac-x64.dmg`, `…-win-x64.exe`), so a download link to `https://github.com/piotrgodycki/aem-eds-studio/releases/latest/download/<name>` always gives the newest published release (drafts and pre-releases don't count). The aem-eds-kit site's download section uses these links.

To release, use **Actions → Release → Run workflow**, choose `patch`, `minor` or `major`, and run it. One run does everything:

1. It raises the version in `package.json`, moves the CHANGELOG's *Unreleased* section under `[x.y.z] - <date>` with its compare links (`scripts/changelog-release.mjs`), and lands that on `main`. `main` takes changes only through pull requests, so the workflow opens the PR *Release vx.y.z* and merges it itself; none needs an approval.
2. It calls the Desktop workflow on that commit: the installers are built and smoke-tested on macOS and Windows.
3. It creates the release `vx.y.z` with the CHANGELOG section as notes and the Windows installer and updater files attached. It stays a **draft**, waiting for the macOS app.
4. On your Mac, `npm run release:mac -- x.y.z` builds that commit and signs and notarises the macOS app (see *Signing the macOS app*). It then smoke-tests the app, attaches it, and publishes the release, which creates the tag. Installed apps update to it.

Untick *macOS app signed on my Mac* to publish straight from CI with an ad-hoc signed macOS app, as before 0.4.7. Tick *Keep the release as a draft* to check a release before it goes out.

One repository setting is needed once: **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**. Without it the run stops at step 1 and says so.

*Unreleased* has to hold something; the run stops if there's nothing to release. The Desktop workflow still runs on its own: *Run workflow* with a version already in `package.json`, or a pushed `v*` tag, makes a draft release. Pull requests only build.

## In-app updates

Publishing the release is what installed apps update to. With the installers, the workflow attaches what `electron-updater` reads: `latest.yml` (Windows), `latest-mac.yml` and the `.zip` builds (macOS), and the blockmaps for partial downloads. The app (`src/desktop/updates.ts`) checks the latest published release (drafts and pre-releases don't count) 10 seconds after start and every 4 hours. It downloads in the background and shows *Restart to update*; an update it has downloaded also installs when the app quits.

- **Windows** updates in place, signed or not.
- **macOS** updates in place only when the build is signed with a Developer ID: Squirrel.Mac refuses to install anything else. `npm run release:mac` marks a signed build (`studioSigned` in the packaged `package.json`); an unsigned one shows *Download x.y.z*, which opens the new `.dmg`. So an app from before the first signed release (0.4.6 or older) downloads the new `.dmg` once.
- The repository is public, so the updater needs no token.
- Apps from before 0.3.0 have no updater: install 0.3.0 once by hand.

## Signing the macOS app

The macOS app is signed and notarised on the maintainer's Mac, so the Developer ID certificate and the Apple credentials stay there: none of them is a GitHub secret.

Signing matters to users in three ways:
- macOS opens a notarised app without *Open Anyway*;
- Squirrel.Mac installs updates only for a signed app;
- the keychain trusts the Developer ID, so its prompt doesn't come back after an update.

Notarisation isn't the App Store: Apple scans the build and issues a ticket, and the app still ships from GitHub Releases.

Once, on the Mac:
1. A **Developer ID Application** certificate with its private key in the login keychain. Check with `security find-identity -v -p codesigning`.
2. The Command Line Tools (`xcode-select --install`); Xcode itself isn't needed.
3. The GitHub CLI signed in (`gh auth login`), to upload to the release.
4. A notarisation profile in the keychain. The app-specific password comes from account.apple.com → Sign-In and Security:
   ```sh
   xcrun notarytool store-credentials aem-eds-notary --apple-id <apple-id> --team-id <TEAMID>
   ```
   `APPLE_KEYCHAIN_PROFILE` picks another profile name.

For each release, after the Release workflow, run `npm run release:mac -- x.y.z` (`scripts/release-mac.mjs`). It works from a clean checkout and returns to your branch at the end. Along the way it:
1. builds the release's commit;
2. signs it and notarises it (electron-builder; `studioSigned` in the packaged `package.json` turns on in-place updates);
3. checks it as a user's Mac will (`codesign --verify`, `stapler validate`, `spctl --assess`);
4. runs the smoke test;
5. attaches the `.dmg`, `.zip`, `latest-mac.yml` and blockmaps, and publishes the release.

The macOS builds in CI (pull requests, or a release with *macOS app signed on my Mac* unticked) are ad-hoc signed.

The Windows build is unsigned unless the repository secrets `WIN_CSC_LINK` (a code-signing `.pfx`, base64) and `WIN_CSC_KEY_PASSWORD` exist. The README tells users how to open it the first time.

## GitHub sign-in

*Connect GitHub* uses the GitHub App **AEM EDS Studio** (Client ID `Iv23liUxSiQhb4ma5CnD`, public, in `BUILT_IN_CLIENT_ID` in `src/server/github-auth.ts`; the install page is `github.com/apps/aem-eds-studio`). A GitHub App, unlike an OAuth App, reaches only the repositories the user installs it on.

Its settings (github.com → Settings → Developer settings → GitHub Apps): **Device Flow** on, **Expire user authorization tokens** on, no callback URL, webhook off, no events. Repository permissions: Contents and Pull requests read and write, Issues read, Metadata read; nothing for organisations or the account. Installable on any account. There is no client secret and no private key: the device flow, and refreshing its tokens, need neither. Without a keychain (the browser mode), the developer sets `GITHUB_TOKEN`; `STUDIO_GITHUB_CLIENT_ID` overrides the Client ID for testing.
