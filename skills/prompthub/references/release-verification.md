# PromptHub Release Verification

## Before Commit

1. Run the repository tests with `node --test tests\*.test.js`.
2. Run `git diff --check`.
3. Confirm no token, cookie, browser session, or private key is staged.
4. Fetch `origin/main`; rebase only when needed and preserve any data release made by the GitHub Action.

## After Push

1. Verify `refs/heads/main` points to the new SHA using `git ls-remote origin refs/heads/main`.
2. Check GitHub Pages serves the new asset/version when the main-site UI changed.
3. Check the domestic URL serves the new asset/version when domestic behavior changed.
4. For performance work, measure HTML, app script, and `/data/collections.json` separately. Verify domestic data uses a local path rather than `raw.githubusercontent.com`.
5. Do not claim deployment complete when only the Git push has completed.

## Cache Policy

- HTML and `data/collections.json`: short revalidation cache (five minutes is the current target).
- JS/CSS: longer revalidation cache with versioned URLs for behavior changes.
- Preserve security headers while adding cache headers.
- Test fresh cache keys when validating a changed cache policy; an old edge cache entry can retain old headers until it expires.
