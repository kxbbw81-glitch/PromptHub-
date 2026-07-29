---
name: prompthub-operations
description: Safely operate, improve, test, and release PromptHub prompt-collection sites and browser extensions. Use for PromptHub data collection, deduplication, GitHub and domestic sync, prompt parsing, editing, performance, security, deployment, and X integration decisions.
---

# PromptHub Operations

Use this skill for the PromptHub repository and its collection pipeline. Preserve data integrity and user-visible sync promises ahead of UI polish.

## Read First

1. Locate the repository and read its `OPERATING_RULES.md`.
2. Read [references/operating-contract.md](references/operating-contract.md) before changing collection, parsing, sync, or status behavior.
3. For release work, read [references/release-verification.md](references/release-verification.md).
4. For any X automation request, read [references/x-compliance.md](references/x-compliance.md) before using a browser or scheduling work.

## Non-Negotiable Contract

- Treat `data/collections.json` on GitHub `main` as the only canonical collection store.
- Use browser local storage only for a short-lived retry queue and machine-local credentials. Never use it as a cross-device database.
- Validate a complete prompt, result media, and a concrete source URL before collection.
- Reject duplicate normalized prompt text and duplicate normalized source-post URLs before writing.
- Write GitHub first. Release to the domestic site only after the GitHub-confirmed record has aged 30 minutes.
- State the actual completed target in all status text. Do not label a local queue as “synced”.
- Sort new records first and keep auto-derived fields editable in the detail view.

## Workflows

### Collect Or Repair Data

1. Fetch the latest `main` before changing collection data.
2. Parse structured prompt blocks before falling back to page text. Remove platform/model prefixes such as “GPT Image 2 on ChatGPT”.
3. Require at least 160 prompt characters, valid HTTPS result media, and a traceable source URL. For X, require a specific status URL, never a feed or bookmark-list URL.
4. Deduplicate by normalized source URL, then normalized prompt fingerprint. Keep the highest-quality existing record and enrich missing fields rather than duplicating it.
5. Add records to the beginning, run tests, commit only valid additions, and push `main`.

### Change Sync Or Extension Behavior

1. Preserve the state machine: validate -> temporary retry queue -> GitHub write -> GitHub confirmation -> server-side domestic release after 30 minutes.
2. Serialize concurrent writes, merge queue items before writing where possible, and retain failures for retry.
3. Surface only these outcomes: GitHub written, already exists, or failed/retrying. Domestic release remains quiet unless it fails.
4. Update `OPERATING_RULES.md`, implementation, and tests together. Repackage the extension only when extension code, permissions, or extension UI changes.

### Improve Domestic Performance

1. Do not make domestic visitors fetch collection data from GitHub Raw.
2. Serve released `/data/collections.json` locally, use short data revalidation, and version application assets when behavior changes.
3. Keep remote media lazy and asynchronous. Do not let slow X images block useful text or navigation.
4. Measure before and after with response timings and verify deployed asset content, not merely a Git commit.

### Review Security

1. Keep secrets out of source, releases, browser pages, logs, and chat responses.
2. Preserve CSP, HTTPS-only image validation, HTML escaping, and no inline executable handlers.
3. Restrict GitHub tokens to the repository and Contents read/write only when write access is necessary.

## X Constraint

Do not automate the logged-in X website with browser scripting. X’s published rules prohibit non-API website automation and warn it can lead to permanent suspension. Keep manual collection available. Only design recurring X ingestion around official API access, explicit user approval, incremental reads, a fixed budget, and no engagement actions.

## Verify And Release

Run `scripts/verify-prompthub.ps1 -ProjectPath <repo path>` after code or data changes. Inspect failures before pushing. For deployments, confirm the remote SHA, the released asset version, and the relevant live response headers/content.

Do not declare domestic deployment complete until the domestic URL serves the new code.
