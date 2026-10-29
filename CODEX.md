# poll-sms codebase map

Last reviewed: 2026-10-28. Scope: project-owned files and folders; excludes `.git/` and installed `node_modules/` dependencies.

## Current state

This repository is a private Bun + TypeScript workspace with two packages: `api` and `dashboard`. Both entry points currently only print `Hello via Bun!` and exit. No polling, SMS delivery, message processing, HTTP server, database, or user interface is implemented yet. Folder names suggest future components; they do not establish a working architecture.

## Folder index

| Folder | Current contents and role | Local documentation |
| --- | --- | --- |
| `api/` | Backend package; declares Fastify, Twilio, and Google Cloud Pub/Sub dependencies. | [API](api/CODEX.md) |
| `api/publisher/` | Placeholder directory; no implementation. | [Publisher](api/publisher/CODEX.md) |
| `api/subscriber/` | Placeholder directory; no implementation. | [Subscriber](api/subscriber/CODEX.md) |
| `api/watcher/` | Placeholder directory; no implementation. | [Watcher](api/watcher/CODEX.md) |
| `dashboard/` | Bun package with a greeting entry point; no frontend framework or UI. | [Dashboard](dashboard/CODEX.md) |

## Root files

- `package.json`: declares `api` and `dashboard` as workspaces, ES modules, and development dependencies on `@types/bun` and TypeScript `^7`. No scripts are defined.
- `bun.lock`: records the root workspace and both packages, including the API's three runtime dependencies.
- `tsconfig.json`: strict TypeScript, ESNext, bundler module resolution, Bun types, and `noEmit`. The package configs currently duplicate these settings rather than extending this file.
- `README.md`: generated Bun setup instructions. Its `bun run index.ts` command is stale because there is no root `index.ts`.
- `.gitignore`: excludes installed dependencies, build output, coverage, logs, common environment files, caches, and editor metadata.
- `CODEX.md`: this index and maintenance guide.

## Commands

Run from the repository root:

```sh
bun install
bun run api/index.ts
bun run dashboard/index.ts
```

Both run commands currently print a greeting; neither starts a service. No test, build, lint, or development-server scripts are configured. No tests or deployment configuration are present.

## Configuration and integration status

The API declares `fastify`, `twilio`, and `@google-cloud/pubsub`, but does not import or configure them. There are no application-defined environment variables, API contracts, topics, subscriptions, credentials configuration, or cross-package calls in the source.

Package-local lockfiles also exist. `api/bun.lock` reflects the earlier Fastify-only manifest and omits the newly declared Twilio and Pub/Sub dependencies; the root lockfile includes them. Review lockfile ownership before changing dependency management.

## Keeping this map current

When adding, moving, or removing a project folder, update this index and the affected folder's `CODEX.md`. Keep a local document in each project-owned folder, including nested folders. Record actual responsibilities, entry points, child folders, dependencies, configuration, commands, and tests as they are implemented. Label proposed behavior as unimplemented. Do not add these documents to generated dependencies or Git internals.
