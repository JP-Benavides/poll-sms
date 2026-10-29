# Dashboard folder

Last reviewed: 2026-10-28. Parent: [project map](../CODEX.md).

## Responsibility and runtime

Workspace package named `dashboard`. Currently `index.ts` only prints `Hello via Bun!` and exits. No browser interface, frontend framework, server, API calls, or UI state exists yet.

## Files

| File | Purpose |
| --- | --- |
| `index.ts` | Placeholder Bun entry point. |
| `package.json` | Private ES module package with Bun types as a development dependency and TypeScript `^7` as a peer dependency. No runtime dependencies or scripts. |
| `tsconfig.json` | Strict TypeScript with Bun types, ESNext, bundler resolution, and no output emission. JSX is configured as `react-jsx`, but React is not declared and no JSX source exists. |
| `bun.lock` | Package-local dependency lockfile; this package is also represented in the root workspace lockfile. |
| `README.md` | Generated Bun install/run instructions. |
| `bruh.txt` | Empty file with no role established by the source. |
| `.gitignore` | Dependency, output, environment-file, cache, and editor exclusions. |
| `CODEX.md` | This folder map. |

There are no project-owned child folders.

## Running and configuration

Install dependencies with `bun install` from the repository root. Run `bun run dashboard/index.ts` from the root, or `bun run index.ts` from this folder. The only current effect is the greeting.

No environment variables, backend URL, routes, build pipeline, or tests are defined.

## Maintenance

Update this document and the [project map](../CODEX.md) as the dashboard develops. Document actual pages, components, data access, state management, configuration, and verification commands when added. Add a local `CODEX.md` for each new project-owned child folder.
