# API folder

Last reviewed: 2026-10-28. Parent: [project map](../CODEX.md).

## Responsibility and runtime

Backend workspace package named `api`. Currently `index.ts` only prints `Hello via Bun!` and exits. It creates no Fastify instance, routes, external clients, or background workers.

## Files

| File | Purpose |
| --- | --- |
| `index.ts` | Placeholder Bun entry point. |
| `package.json` | Private ES module package; declares Fastify `^5.12.7`, Twilio `^6.2.0`, and Google Cloud Pub/Sub `^6.3.1`. Bun types are a development dependency; TypeScript `^7` is a peer dependency. No scripts. |
| `tsconfig.json` | Strict TypeScript with Bun types, ESNext, bundler resolution, and no output emission. Does not extend the root config. |
| `bun.lock` | Older package-local lockfile with Fastify only; does not reflect all current manifest dependencies. The root workspace lockfile includes them. |
| `README.md` | Generated Bun install/run instructions. |
| `.gitignore` | Dependency, output, environment-file, cache, and editor exclusions. |
| `CODEX.md` | This folder map. |

## Child folders

- [publisher](publisher/CODEX.md): no implementation yet.
- [subscriber](subscriber/CODEX.md): no implementation yet.
- [watcher](watcher/CODEX.md): no implementation yet.

These folders have no defined interfaces or connections to the entry point. Their names alone do not establish message flow.

## Running and configuration

Install dependencies with `bun install` from the repository root. Run `bun run api/index.ts` from the root, or `bun run index.ts` from this folder. The only current effect is the greeting.

No environment variables, port, HTTP routes, Pub/Sub topics, subscriptions, Twilio settings, persistence, or tests are defined. Installed integration libraries are not yet used by application code.

## Maintenance

Update this document and the [project map](../CODEX.md) when the backend structure changes. Document routes, message contracts, client configuration, worker startup, and verification commands when implemented. Keep each child folder's local map aligned with its source.
