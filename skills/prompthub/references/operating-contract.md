# PromptHub Operating Contract

## Data And Visibility

| Concern | Required behavior |
| --- | --- |
| Canonical data | `data/collections.json` on GitHub `main` |
| Main site | Displays GitHub canonical data immediately after confirmed write |
| Domestic site | Displays only records released at least 30 minutes after `githubSyncedAt` |
| Local storage | Temporary retry queue and local credential only |
| Ordering | Descending `githubSyncedAt` / `collectedAt` |

## Acceptance And Deduplication

- Parse the actual prompt body, not a platform label, title, model name, tutorial copy, or advertisement.
- Require at least 160 characters, valid HTTPS result media, source URL, title, prompt, category/tags, and collection time.
- X sources must be a concrete `/status/<id>` URL. A home, search, or `/i/bookmarks` page is not a source URL.
- Treat an exact normalized source URL as one item.
- Treat an exact normalized prompt fingerprint as one item even if the source differs.
- Enrich the existing record when an otherwise duplicate item supplies missing quality fields.

## Sync State Machine

```text
candidate -> validation -> local retry queue -> GitHub read/merge/write -> confirmation
                                                               -> +30 minutes -> domestic release
```

- Queue writes so concurrent collection requests cannot overwrite each other.
- A successful GitHub write removes only the confirmed queue items.
- On GitHub failure, retain the queue and show the actionable failure.
- The GitHub Action is the domestic-release authority. Do not let an extension or page release early.

## User Status Contract

- Success: `已写入 GitHub 主站 X 个提示词`
- Duplicate: `GitHub 主站无新增，X 个提示词已存在`
- Failure: `待同步 X 个提示词` plus failure cause
- Never use an unqualified `已同步` status.

## UI Contract

- Detail pages expose editable title, prompt, links, images, and inferred metadata. Save edits on Enter.
- Preserve image aspect ratio when it can be detected.
- Do not add an unrequested `Try / 去生成` page or action.
- Homepage copy: `探索高品质纳米提示词库。`
- Category counts derive from current canonical data.

## Extension Packaging Boundary

Repackage the extension only for changes to extension recognition, permissions, popup/UI, collection interaction, sync protocol, or extension status wording. Do not require an extension update for site UI, SEO, collection data, domestic release script, or server-side cache changes.
