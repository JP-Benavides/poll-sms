# poll-sms codebase map

Last reviewed: 2026-10-30.

## Project status

This repository is a local Bun + TypeScript script that opens a visible Playwright Chromium browser, signs into Poll Everywhere through NYU/Microsoft and manual Duo approval, continuously reads eligible multiple-choice polls, and sends each distinct parsed poll to a configured Discord webhook. The source lives under `src/`; package configuration and `.env` are at the repository root. The README tagline mentions answering polls, but the code does not submit answers. This is not currently an API server or dashboard, and there is no SMS provider or SMS sending implementation despite the repository name.

The detector watches `#active_tab_content` with one 300 ms debounce. A visible `.component-response-header__title` means open; its absence means closed. It calls Bun-side parsing without extracting question content itself. Discord delivery uses `DISCORD_URL`; failures are logged without automatic retry.

The previous `api/` and `dashboard/` workspaces and their placeholder entry points were removed. Dependencies and the lockfile are consolidated at the root; unused Fastify, Google Cloud Pub/Sub, and Twilio dependencies were removed.

## Setup and commands

Run commands from the repository root:

```sh
bun install
bunx playwright install chromium
bun start
bun run typecheck
```

The `.env` file at the project root is loaded by `src/main.ts`. It should contain `USERNAME`, `PASSWORD`, `POLL_EV_LINK`, and `DISCORD_URL`, plus `BOT_TOKEN`, `CHANNEL_ID`, and `USER_ID` for the incoming Discord listener; do not expose or commit credential values; inspect variable names or presence without printing values when diagnosing configuration. `.gitignore` excludes `.env` and common local dotenv variants. `bun start` opens a non-headless browser; approve Duo manually when prompted. The process remains alive until the browser disconnects/closes.

`bun run typecheck` invokes `tsc --noEmit` using the root `tsconfig.json`. `bun test ./test` runs local Playwright fixture tests with mocked callbacks. There is no build script.

## File map and agent guidance

### Source files

#### `src/main.ts`

Application entry point. Loads `../.env`, builds `UserInfo` from environment variables, checks required values, launches Chromium, runs login, and coordinates watchdog-triggered parsing and Discord delivery until browser disconnection. It serializes parse attempts, retains a pending change, and checks that the poll instance is still visible and unchanged before sending. It does not take question/answer snapshots. Deduplication is per run, by poll instance ID, question, and ordered answers; reopening an unchanged poll does not resend. Keep orchestration here; keep selectors and page parsing in their modules. The entrypoint is guarded by `import.meta.main` so tests can import `createPollHandler` without launching login. Stop both the handler and detector during shutdown.
#### `src/login.ts`

`navigateLogin` automates Poll Everywhere and Microsoft sign-in using hard-coded selectors, then fills the presenter name parsed from the `POLL_EV_LINK` path into the profile action-sheet form when available. It waits up to 180 seconds for a button matching both `#idSIButton9` and the exact accessible name `Yes` after the user approves Duo. Authentication flow and selectors depend on external pages and can break when those pages change. The `context` argument is currently unused. No persisted session reuse is implemented.
#### `src/parser.ts`

`scrapePage` waits for one visible legacy multiple-choice question and its answers, normalizes whitespace, and returns a `ParsedPoll`. It does not monitor changes. The watchdog reuses this parser unchanged; its eligibility checks mirror these selectors and need live validation when the external DOM changes.
#### `src/detect.ts`

`startDetection(page, onQuestion)` installs a MutationObserver on `#active_tab_content`, debounces changes for 300 ms, and calls `onQuestion` if the question heading is visible, otherwise `onClosed` to disable answer capture. It checks at startup, reinstalls after page loads, and returns a cleanup function. One watcher is started per Page. No answer extraction, status-text matching, disabled-button checks, periodic polling, or stability snapshots.
#### `src/discord_webhook.ts`

`send_message` formats the question and numbered answers into Discord `content`, disables mentions, enforces the 2000-character limit, and awaits the request. Non-success responses throw with HTTP status and response body. The webhook does not validate the URL in advance or set `wait=true`.
#### `src/discord_websocket.ts`

`startDiscord(config, onMessage)` logs in a discord.js client, listens for new server messages from the configured `USER_ID` in `CHANNEL_ID`, and passes their text to the callback. Bot and webhook messages are ignored. Requires the Message Content Intent in the Developer Portal and channel visibility. Returns an async disconnect function; login failures dispose the client. `main.ts` routes eligible messages to the poll answer state, logs accepted answers, and disconnects during shutdown. No answer submission or Discord replies are implemented.
#### `src/poll_answer.ts`

In-memory disabled/enabled answer state. Temporary testing override: main calls `createPollAnswerState(true)` to keep capture enabled across replies and closures, using an explicitly labeled test poll when none is pending. Set false to restore normal behavior. A newly parsed poll enables capture and replaces any pending poll. The first nonempty eligible reply atomically consumes it and retains the answer with a snapshot of the poll and instance ID. Main disables capture on poll closure, navigation, page closure, and shutdown. Captured text is logged, not submitted or validated as a choice. Duplicate poll detections do not re-arm capture.
#### `src/types.ts`

Shared `UserInfo` and `ParsedPoll` interfaces. `ParsedPoll` has a question string and answer string array. `pollEvLink` and `discordURL` are typed as strings.

### Tests

#### `test/detect.test.ts`

Bun tests using local Playwright pages and mocked delivery callbacks. Covers waiting/open states, disabled answers, startup, mutation bursts, replacement of poll content, deduplication, changes during parsing, navigation, and cleanup. No live login or Discord delivery is performed.

#### `test/discord_websocket.test.ts`

Tests incoming-message filtering and cleanup with mocked login/destroy; no live Discord connection or messages.

### Root files

#### `CODEX.md`

This codebase map. Keep it as the single agent-oriented code map at the repository root and update its file list, status, commands, and known limitations when implementation changes. Do not add another source-level map.
#### `README.md`

User-facing setup, run instructions, and limitations. Keep claims aligned with actual behavior, especially notification and change-detection behavior.
#### `package.json`

Bun package metadata, runtime dependencies, development dependencies, and the `start`, `typecheck`, and `test` scripts. The test command runs `bun test ./test`.
#### `bun.lock`

Bun dependency lockfile. Let Bun update it when dependency declarations change; do not hand-edit package resolutions.
#### `tsconfig.json`

TypeScript settings and source include pattern (`src/**/*.ts`); strict checking, bundler resolution, and no output emission. Preserve these constraints when changing source layout.
#### `.gitignore`

Excludes dependencies, build outputs, logs, caches, editor metadata, and dotenv files. Keep credentials and local auth material ignored.
#### `.env`

Local, ignored runtime configuration containing credentials and poll link. Never expose its values in documentation, logs, patches, or tool output. The file is present locally but is not tracked configuration.

## Current limitations and concrete issues

- Watchdog behavior has local Playwright fixture coverage with mocked delivery callbacks. The two-state heading check is based on the supplied waiting page and inspected rendered question. The watcher expects the outer `#active_tab_content` container to remain in place; its contents may be replaced. No periodic fallback is used, and parse failures retry on later DOM changes. Full live transitions and delivery have not been tested.
- Discord notifications require a usable `DISCORD_URL`. Messages over 2000 characters fail locally; delivery errors are logged without automatic retry. Live delivery has not been verified.
- Browser login depends on fixed third-party selectors, manual Duo, and an external flow that can change. No session persistence or automatic retry is implemented.
- There is no API, dashboard, SMS provider, or SMS sending configured. Tests live in `test/detect.test.ts`; Chromium must be installed to run them.

## Maintenance guidance

When adding, moving, or removing files, update this map and the README as needed. Keep secrets in ignored local environment files and refer to variable names only. When changing Poll Everywhere selectors or status heuristics, verify behavior against the live page before relying on it. Keep deduplication and delivery-error behavior documented. Keep the project description accurate: call it a local Bun watcher until an API, dashboard, or SMS integration actually exists.
