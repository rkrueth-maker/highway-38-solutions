# AGENTS.md

## Approved Asset Authority

These rules apply whenever Rick approves a logo, image, visual concept, page design, site rebuild, or complete site build.

1. Treat an approved image or logo as a **controlled binary**, not a visual suggestion.
2. Do not redraw, regenerate, restyle, recolor, crop, trace, approximate, screenshot, or replace an approved asset unless Rick explicitly approves that change.
3. Do not use image generation to recreate an approved asset.
4. Do not use another repository image as a loading fallback for an approved logo.
5. The filename alone is not proof that the correct asset is installed. Validate the actual bytes.
6. Read `scripts/config/approved-public-assets.json` before changing public imagery.
7. When an approved asset changes, update the binary, manifest, cache key, public references, and verification expectations in the same PR.
8. Preserve visible text branding for accessibility, but never substitute a different image when the approved logo fails to load.

## Approved Asset Fast Path

Use the first available transfer route and stop when the exact bytes are safely committed:

1. current-conversation attachment with a usable local path;
2. connector-native file transfer without re-encoding;
3. temporary hosted-source transfer through a one-time PR workflow.

For a temporary hosted-source transfer:

- download only the exact approved binary;
- validate file signature, size, dimensions, and hash;
- commit only the intended binary to the PR branch;
- confirm the binary commit exists before merge;
- remove the temporary workflow, trigger, hosted URL, and diagnostic files after deployment.

Never solve a binary-transfer problem by substituting another logo or by changing the site design around a missing asset.

## Fast Site Build and Rebuild Rules

1. Start from current `main` and inspect the existing shared shell once.
2. Inventory approved image paths before writing page markup.
3. Map pages to approved imagery before editing.
4. Use one integrated branch for the full approved page set.
5. Reuse:
   - `assets/css/h38-site-v2.css`
   - `assets/js/h38-site-v2.js`
   - the approved shared header, navigation, footer, cards, grids, spacing, and responsive behavior.
6. Make shared improvements in shared files instead of rebuilding slightly different page shells.
7. Use repository-confirmed asset paths only.
8. Use the approved asset manifest cache key on every controlled logo reference.
9. Batch old-reference cleanup across all in-scope pages instead of fixing pages one at a time.
10. Preserve Customer Portal security, authentication, roles, Apps Script IDs, approval gates, no-automatic-charge controls, production URLs, and data isolation unless the approved scope explicitly changes them.
11. A public redesign must not silently become a portal, platform, pricing, or architecture rewrite.
12. Do not reopen approved logo, imagery, layout, pricing, or architecture decisions without a verified conflict.

## Image Verification Rules

Before opening or merging a visual PR, run:

```bash
python3 scripts/verify-public-images.py
```

The permanent gate must verify:

- the canonical logo is a real image;
- the logo Git blob SHA matches `scripts/config/approved-public-assets.json`;
- controlled public references use the manifest cache key;
- forbidden substitute paths are absent;
- repository-relative image paths resolve;
- content images have descriptive alt text;
- major public pages contain explicit non-logo imagery.

Do not weaken the image gate to accommodate a corrupt primary asset or a substitute logo.

## Deployment Safety Rules

These rules apply to any request that mentions deploy, deployment, GitHub Pages, live site verification, or publishing visual/site changes.

1. Separate all findings by scope:
   - `LOCAL`
   - `ORIGIN_MAIN`
   - `LIVE_PAGES`
2. Print both commit IDs before any conclusion:
   - local `HEAD`
   - `origin/main`
3. If local work differs from `origin/main`, do not treat local file absence or local preview differences as evidence that remote or live is broken.
4. Do not deploy from a dirty working tree.
5. Do not deploy from a branch that is not based on the current `origin/main`.
6. Use a clean worktree or clean branch based on `origin/main` for deploy work.
7. Before claiming a deploy is needed, prove the mismatch with cache-busted live checks.
8. If the intended markers already appear in both `ORIGIN_MAIN` and `LIVE_PAGES`, do not deploy again.
9. A merged PR is not deployment proof. Observe the main-branch Pages run and record its run ID, conclusion, and deployed source SHA.
10. When source is correct but live is stale, debug the Pages workflow and artifact source before rewriting the site.
11. Temporary deployment recorders or transfer workflows must be removed after successful verification.
12. End deploy verification with a one-line verdict in this format:
   - `VERDICT: <PASS|BLOCKED|ALREADY_LIVE|UNKNOWN> | Scope Verified: <LOCAL|ORIGIN_MAIN|LIVE_PAGES|ORIGIN_MAIN+LIVE_PAGES|LOCAL+LIVE_PAGES>`

## Required Preflight

Before any deploy or deploy recommendation, run the guard script when possible:

```bash
python3 scripts/guard_deploy.py \
  --page sample-library-now.html \
  --live-url "https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html" \
  --match "Browse 15 samples" \
  --match "Compare products & pricing" \
  --match 'data-samples="all"'
```

Use page-appropriate `--match` markers for other deploy targets.

Optional wrapper command:

```bash
scripts/deploy_with_guard.sh \
  --page sample-library-now.html \
  --live-url "https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html" \
  --match "Browse 15 samples" \
  --match "Compare products & pricing" \
  --match 'data-samples="all"'
```

## Reference Docs

Consult these before image-heavy builds or deployment work:

- `docs/public-website/APPROVED_ASSET_FAST_PATH.md`
- `docs/public-website/WEB_IMAGE_DEPLOYMENT_PLAYBOOK.md`
- `docs/brand/HIGHWAY_38_PUBLIC_LOGO_STANDARD.md`
- `docs/CHATGPT_LIVE_DEPLOY_INSTRUCTIONS_2026-07-06.md`
- `docs/CHATGPT_HANDOFF_DEPLOY_PHOTOS_2026-07-06.md`

Treat older docs as process references only. The current manifest, repository binary, current `main`, and verified live deployment are the technical source of truth.
