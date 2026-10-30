# Watcher folder

Last reviewed: 2026-10-29. Parent: [API map](../CODEX.md). Root: [project map](../../CODEX.md).

## Current state

`login.ts` opens the hardcoded `https://pollev.com/gsandoval` link in visible Playwright Chromium with a fresh desktop browser context. It waits until the browser is closed, then exits. Startup or navigation failures are reported with a nonzero exit status and the browser is cleaned up.

Run from the repository root:

```sh
bun run api/watcher/login.ts
```

Requires installed workspace dependencies and Playwright Chromium (`bunx playwright install chromium` from `api/` if missing). Manually verify that the Poll Everywhere page appears, remains open for inspection, and closing the browser ends the process.

The script loads `USERNAME` (email) and `PASSWORD` from `api/.env`, follows the configured sign-in controls, and waits up to three minutes for the Yes button after manual Duo approval. Sessions are not persisted and existing authentication is not detected.

`parser.ts` exports `scrapePage(page): Promise<ParsedPoll>`, returning `{ question: string, answers: string[] }`. After login, the script waits up to 30 seconds each for a visible multiple-choice question heading and the first answer box, normalizes whitespace, and prints the question and answers once. Each visible choice div inside the response container's wrapper div is treated as one answer, in DOM order. The selector accepts changing poll instance IDs. Missing or empty content is reported while the browser remains open for inspection. Continuous monitoring is not implemented.

`detect.ts` is an unconnected browser-side mutation observer draft; `types.ts` contains the `UserInfo` interface used by the launch script. No automated tests are defined for this increment.

## Maintenance

When implementation is added, document the watched source, startup, scheduling, state, emitted events, failures, shutdown, and tests. Record connections to other API components only once implemented. Update the parent and root maps if the folder's responsibility changes.
