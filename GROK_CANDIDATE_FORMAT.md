# Grok Candidate Handoff Format

Grok CLI is a public-content discovery source only. It must not write GitHub,
call the X API, use browser cookies, or inspect a logged-in X page.

## Delivery location

Save one batch as UTF-8 JSON at:

```text
staging/grok-x-cli-output.json
```

This directory is intentionally not committed. The file is a local candidate
handoff, not PromptHub collection data.

## Required JSON shape

Return JSON only, without Markdown or explanatory prose:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-29T12:00:00.000Z",
  "producer": "grok-cli-public-x-search",
  "candidates": [
    {
      "sourceUrl": "https://x.com/creator/status/1234567890123456789",
      "title": "Short, descriptive prompt title",
      "prompt": "The complete reusable image or video generation prompt only. Do not include a model label, social caption, tutorial, or commentary.",
      "mediaType": "image",
      "imageUrls": [
        "https://pbs.twimg.com/media/example?format=jpg&name=large"
      ],
      "videoPoster": "",
      "aspectRatio": "4:5",
      "category": "人像",
      "tags": ["cinematic", "portrait"],
      "model": "GPT Image",
      "signals": ["Prompt:"]
    }
  ]
}
```

For `mediaType: "video"`, `imageUrls` may be empty only when `videoPoster`
is a direct HTTPS poster URL. For images, `imageUrls` must contain at least one
direct HTTPS result image URL.

## Acceptance rules

Every candidate must meet all of these conditions before Codex can merge it:

1. `sourceUrl` is a concrete public `https://x.com/<handle>/status/<id>` URL.
2. `prompt` contains only the reusable prompt body and is at least 160
   characters after prefix removal. Remove labels such as `GPT Image 2 on
   ChatGPT`, `Nano Banana Prompt`, and `Prompt:`.
3. A real result image, video poster, or other result media is supplied by
   HTTPS. Do not use a feed URL, profile image, or unrelated thumbnail.
4. `title`, `category`, `tags`, `aspectRatio`, and `model` describe the actual
   post. Empty `model` and `aspectRatio` are allowed only when the post does
   not reveal them.
5. Skip tutorials, product promotions, repost-only posts, incomplete prompts,
   posts without result media, and duplicate candidates.

## Handoff and release sequence

1. Grok CLI writes the candidate batch to `staging/grok-x-cli-output.json`.
2. Codex runs the candidate validator, which removes invalid entries and checks
   source-URL and normalized-prompt duplicates against `data/collections.json`.
3. Codex reviews accepted records, runs the repository tests, and then writes
   accepted records at the top of the canonical data file.
4. Codex commits and confirms the GitHub `main` write. Only this confirmation
   counts as primary-site collection success.
5. The hourly GitHub workflow marks eligible records for the domestic release
   no earlier than 30 minutes after `githubSyncedAt`.

No candidate batch is published automatically merely because Grok produced it.
