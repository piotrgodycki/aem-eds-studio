# Changelog

All notable changes to aem-eds-studio. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Agent sign-in with the provider (Anthropic, OpenAI) in the browser, without a terminal** (STUDIO-69)

## [0.4.2] - 2026-11-08

### Fixed
- **Dropdowns in the app's style; agent and model stack on a phone** (STUDIO-64)
- **Agent sign-in on macOS without asking to control Terminal** (STUDIO-62)

### Security
- **Electron 45 and patched dependencies** (STUDIO-53)
- **Window permissions denied, a Content Security Policy, a stricter file check in the UI server** (STUDIO-55)

### Changed
- **Clearer description: the desktop studio for aem-eds-kit** (STUDIO-66)
- **Current GitHub Actions; only the release job can write; Dependabot and CodeQL** (STUDIO-57)
- **Short README and CHANGELOG, with the tech stack** (STUDIO-50)

## [0.4.1] - 2026-11-08

### Fixed
- **The engine's name in the side menu** (STUDIO-48)
- **No keychain prompt at every launch on macOS** (STUDIO-46)

## [0.4.0] - 2026-11-08

### Added
- **First-run tutorial** (STUDIO-17)

### Changed
- **aem-eds-kit 0.4.63** (STUDIO-43)
- **One-click releases** (STUDIO-41)
- **Full width, with a side menu** (STUDIO-39)
- **README says how the studio and aem-eds-kit fit together** (STUDIO-34)
- **Release from Actions** (STUDIO-33)

### Fixed
- **Copying text in the desktop app** (STUDIO-37)
- **"Not logged in" from the agent** (STUDIO-37)

## [0.3.0] - 2026-11-07

### Added
- **Connect GitHub** (STUDIO-28)
- **In-app updates** (STUDIO-26)
- **Choose a local folder** (STUDIO-24)
- **Project settings import and export** (STUDIO-20)
- **Several projects at once** (STUDIO-20)
- **Work board** (STUDIO-18)
- **Devices and a collapsible review panel** (STUDIO-15)

### Changed
- **aem-eds-kit 0.4.62** (STUDIO-22)
- **README** (STUDIO-13, STUDIO-30)

## [0.2.0] - 2026-11-06

### Added
- **Projects** (STUDIO-1)
- **Drafts with review rounds** (STUDIO-1)
- **Local-only server** (STUDIO-1)
- **The engine is bundled** (STUDIO-3)
- **Desktop app only** (STUDIO-9)
- **Desktop app for macOS and Windows** (STUDIO-5)

### Changed
- **The aem-eds-kit look** (STUDIO-7)
- **Draft review fills the window** (STUDIO-7)

[Unreleased]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.2...main
[0.4.2]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/piotrgodycki/aem-eds-studio/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/piotrgodycki/aem-eds-studio/releases/tag/v0.2.0
