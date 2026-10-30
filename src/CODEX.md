# Local watcher source

Last reviewed: 2026-10-30. Parent: [project map](../CODEX.md).

- `main.ts`: loads root `.env`, validates configuration, launches Chromium, orchestrates login/detection/parsing and the draft webhook call, and waits for browser closure.
- `login.ts`: follows Poll Everywhere and Microsoft sign-in controls, then waits up to three minutes for Yes after manual Duo approval. No session reuse.
- `parser.ts`: returns `ParsedPoll` with question text and separate answer strings. Selectors support changing multiple-choice instance IDs. Reads once per invocation.
- `detect.ts`: installs a MutationObserver inside the Playwright page; logs state changes in the browser console. Does not trigger the parser yet.
- `discord_webhook.ts`: unfinished notification sender; currently receives a misconfigured URL and sends a payload that needs Discord formatting. It does not await its fetch.
- `types.ts`: shared configuration and parsed-poll interfaces.

Run and typecheck through the root package scripts. Keep credentials and authentication state out of tracked files. There are no automatic retries or continuous parsing yet.
