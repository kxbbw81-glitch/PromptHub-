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
  "count": 1,
  "producer": "grok-cli-public-x-search",
  "candidates": [
    {
      "id": "x_1234567890123456789",
      "sourceUrl": "https://x.com/creator/status/1234567890123456789",
      "url": "https://x.com/creator/status/1234567890123456789",
      "domain": "x.com",
      "source": "x_search",
      "title": "Short, descriptive prompt title",
      "prompt": "The complete reusable image or video generation prompt only. Do not include a model label, social caption, tutorial, or commentary.",
      "mediaType": "image",
      "images": [
        "https://pbs.twimg.com/media/example?format=jpg&name=large"
      ],
      "image": "https://pbs.twimg.com/media/example?format=jpg&name=large",
      "videoPoster": "",
      "videoUrl": "",
      "aspectRatio": "4:5",
      "category": "人像",
      "tags": ["cinematic", "portrait"],
      "model": "GPT Image",
      "collectedAt": "2026-07-29T12:00:00.000Z",
      "signals": ["Prompt:"]
    }
  ]
}
```

For `mediaType: "video"`, `images` may be empty only when `videoPoster`
is a direct HTTPS poster URL. Provide `videoUrl` when a direct HTTPS video URL
is available. For images, `images` must contain at least one
direct HTTPS result image URL.

`imageUrls` is accepted as a backwards-compatible alias for `images`. Grok
must not provide `githubSyncedAt` or `domesticSyncedAt`: Codex creates those
timestamps only after a successful canonical write and later domestic release.

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
6. Brand Logo/VI multi-direction proposals are valid e-commerce candidates when
   they include a complete reusable prompt and actual result images. Mark the
   relevant discovery signal and preserve enough tags to classify them as
   `电商视觉` with the `品牌视觉` use-case.

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
