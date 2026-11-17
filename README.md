<p align="center">
  <img src="docs/assets/icon.png" width="96" height="96" alt="AEM EDS Studio">
</p>

<h1 align="center">AEM EDS Studio</h1>

<p align="center">
  Turn designs and plain words into AEM Edge Delivery blocks with your AI agent.<br>
  Anyone on the team takes a feature from idea to pull request. Developers review and merge. macOS and Windows.
</p>

<p align="center">
  <a href="https://piotrgodycki.github.io/aem-eds-kit/#studio"><img alt="Download for macOS (Apple Silicon)" src="https://img.shields.io/badge/macOS-Apple%20Silicon-ff5a36?style=for-the-badge&logo=apple&logoColor=white"></a>
  <a href="https://piotrgodycki.github.io/aem-eds-kit/#studio"><img alt="Download for macOS (Intel)" src="https://img.shields.io/badge/macOS-Intel-1d1d1a?style=for-the-badge&logo=apple&logoColor=white"></a>
  <a href="https://piotrgodycki.github.io/aem-eds-kit/#studio"><img alt="Download for Windows" src="https://img.shields.io/badge/Windows-x64-1d1d1a?style=for-the-badge&logo=windows&logoColor=white"></a>
</p>

<p align="center">
  <a href="https://github.com/piotrgodycki/aem-eds-studio/releases"><img alt="Release" src="https://img.shields.io/github/v/release/piotrgodycki/aem-eds-studio?color=ff5a36"></a>
  <a href="https://github.com/piotrgodycki/aem-eds-studio/actions/workflows/desktop.yml"><img alt="Desktop build" src="https://github.com/piotrgodycki/aem-eds-studio/actions/workflows/desktop.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/aem-eds-kit"><img alt="Engine: aem-eds-kit" src="https://img.shields.io/npm/v/aem-eds-kit?label=engine%20aem-eds-kit&color=1d1d1a"></a>
</p>

![The chat: an agent's answer about the project, with a table and code, and the message box at the bottom](docs/assets/chat.png)

Describe a block or paste a design link; your AI agent builds it, you review it, a developer accepts it. Engine: **[aem-eds-kit](https://github.com/piotrgodycki/aem-eds-kit)**.

## Features

- Chat with your project: ask, drop in designs, screenshots, PRs; say yes to a proposed block or change
- Blocks from Figma, a web page, a screenshot or plain words
- Review on desktop, tablet and phone (or all three), click an element to say what to change
- QA with Select: an element's size, font, colours, margin and padding as in DevTools, a screenshot with them drawn on, and Report, which opens a GitHub issue with both, or a Bug in Jira or Azure DevOps with the screenshot attached
- Jira or Azure DevOps as the project's tracker (Project settings): QA reports go there, and a draft on feature/STUDIO-12 links to STUDIO-12. The token is kept in the system keychain
- One working copy per draft: each message in the review is a change applied at once, Undo takes it back, and nothing reaches GitHub before the pull request
- Pull requests with a short summary, Before / After test URLs and screenshots; reviewers and assignee
- Ticket branches (`feature/STUDIO-1`, `bug/STUDIO-2`)
- Edit content in DA or the Universal Editor from the project and the review: the link is found from the repository (DA) or pasted (UE), and checked
- Copy a block as a table for Document Authoring (da.live), with texts the agent writes when the block has none and a line where each image goes
- Overview: blocks, third parties, data layer, page metadata, events, GTM (its container ID from the sheet in the content tree, with Edit in DA)
- Performance: Core Web Vitals from the site's RUM data (the domain and key kept in the keychain, behind a closed eye), the pages to look at, and what runs in each loading phase with third parties flagged
- Analytics per block: events, names, data layers
- The page event is yours: its name and every field (start from the default, GA4 or the Adobe Client Data Layer, a dot nests a field), each from metadata, the URL, a query parameter, a built-in, a fixed value or a function the agent writes, saved as a pull request and checked on the published pages
- Your own events for blocks, with their fields (an attribute, an element's text, the block's position, the link, a page event field): defined once in Overview, picked in a block's Analytics, also for clicks on one element
- Agents tab: every run numbered (AG-142), grouped, filtered, kept across restarts
- What the studio saved: blocks accepted, first tries, versions each, time to accept, agent minutes and cost, in Overview and the agents palette
- Agents palette in the screen's corner while the studio is in the background
- Work board: GitHub pull requests and issues with the studio's own work
- From your phone: pair with a QR code (Wi-Fi or Tailscale), and the project is its chat, see [docs/remote.md](docs/remote.md)
- Logs in Settings → Logs
- Safe by default: agents stay in the project, tokens in the system keychain

<p>
  <img src="docs/assets/review.png" width="64%" alt="A draft under review: Undo, the device switch, Accept, and the box for changes under the preview">
  <img src="docs/assets/phone.png" width="31%" alt="A project on a phone: one slim bar over its chat">
</p>

## Install

Download from the [site](https://piotrgodycki.github.io/aem-eds-kit/#studio) or [Releases](https://github.com/piotrgodycki/aem-eds-studio/releases). Unsigned builds: *Open Anyway* (macOS) / *Run anyway* (Windows) on first launch. You need an agent signed in with your account and `git`; no Node.

## Development

Electron, React 19 and Hono in TypeScript; tests with Vitest, lint with Biome.

```bash
pnpm install
pnpm run desktop                                  # build and open the app
pnpm run dev:server   # + pnpm run dev:web        # API on :4600, UI with hot reload
pnpm run lint && pnpm run typecheck && pnpm test  # tests use a fake eds
```

Docs: [architecture](docs/architecture.md), [releases](docs/releases.md), [changelog](CHANGELOG.md).

## License

MIT © Piotr Godycki
