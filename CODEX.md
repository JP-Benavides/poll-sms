# poll-sms codebase map

Last reviewed: 2026-10-30.

Single local Bun + TypeScript package. `src/main.ts` launches visible Playwright Chromium, performs interactive NYU/Duo login, installs a browser-side detector, and parses the current poll once. No frontend, API server, Pub/Sub, or SMS integration is configured.

Root `package.json` owns dependencies and `bun.lock`. Run `bun start` and `bun run typecheck` from the root. Root `.env` contains local credentials and is ignored by Git. See [README](README.md) for setup and current limitations, and [source map](src/CODEX.md) for module responsibilities.

Keep these maps and README aligned with implementation changes.
