# Subscriber folder

Last reviewed: 2026-10-28. Parent: [API map](../CODEX.md). Root: [project map](../../CODEX.md).

## Current state

This directory contains only this document. There are no source files, child folders, exports, commands, configuration, or tests.

The name suggests a future message consumer, but no subscription or processing behavior is implemented. The parent API declares Pub/Sub and Twilio dependencies; no code connects them here. A relationship between consuming messages and sending SMS has not been defined.

## Maintenance

When implementation is added, document startup, subscription configuration, incoming payloads, processing effects, acknowledgment and retry behavior, shutdown, and tests. Update the parent and root maps if the folder's responsibility changes.
