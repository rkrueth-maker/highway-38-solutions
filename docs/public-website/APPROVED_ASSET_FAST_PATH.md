# Approved Asset and Site-Build Fast Path

## Purpose

Use this process after Rick approves a logo, image set, visual direction, or complete page concept. The goal is to move from approved source material to a verified live release in one controlled build without redrawing assets, inventing substitutes, repeating page-by-page discovery, or confusing repository state with deployment state.

## Non-negotiable rule

An approved image or logo is a **controlled binary**, not a visual suggestion.

Do not redraw, regenerate, restyle, crop, recolor, trace, approximate, screenshot, or replace it unless Rick explicitly approves that change. Do not use a different image as a loading fallback. The filename alone is not proof that the correct binary is installed.

## Approved-asset intake order

Use the first available route and stop once the exact bytes are safely in the repository:

1. **Current conversation attachment with a usable local path**
   - Materialize or use the supplied path.
   - Validate file signature, size, and dimensions.
   - Record a cryptographic hash and Git blob SHA.
2. **Connector-native file reference**
   - Transfer the file without re-encoding it.
   - Validate the resulting repository binary.
3. **Temporary hosted-source transfer**
   - Use only when direct binary transfer is unavailable.
   - Put the exact approved file at a temporary Drive/Slides-hosted URL.
   - Use a one-time pull-request workflow to download, validate, and commit only that binary.
   - Confirm the binary commit lands on the PR branch before merging.
   - Remove the temporary workflow, trigger, URL, and status files after deployment.

Never use image generation, a browser screenshot, an HTML rendering, a thumbnail, or a substitute repository image to recreate an approved asset.

## Machine-readable source of truth

Read `scripts/config/approved-public-assets.json` before changing public imagery.

For the controlled logo it records:

- canonical repository path;
- exact Git blob SHA;
- required cache key;
- public reference;
- alt text;
- visible text fallback;
- whether image substitution is allowed; and
- forbidden substitute paths.

When Rick approves a replacement asset, update the binary and manifest in the same PR. Do not change only the filename or cache key.

## Fast site-build workflow

### 1. Inspect once

Before editing pages:

- start from current `main`;
- inspect the existing shared CSS, JavaScript, header, footer, navigation, and Pages workflow;
- inventory available approved image paths;
- identify all pages in scope;
- identify protected routes and external destinations that must not change.

Do not rediscover the same structure separately for every page.

### 2. Build one shared shell

Use the existing shared public system:

- `assets/css/h38-site-v2.css`
- `assets/js/h38-site-v2.js`
- the approved header and navigation;
- the approved footer;
- shared buttons, cards, grids, spacing, and responsive breakpoints.

Change the shared shell first when the same improvement belongs on several pages. Do not hand-build slightly different headers or footers on each page.

### 3. Map approved imagery before writing markup

Create a simple page-to-image map before editing:

| Page role | Preferred image type |
|---|---|
| Homepage hero/proof | strongest broad business or project image |
| Solution category | category-specific approved image |
| Process page | request, planning, scope, or workflow image |
| Contractor/quote page | field capture, checklist, plans, or quote imagery |
| Business Office page | approved business workflow imagery |
| Proof/examples | existing condition → concept → plan/scope → quote/manage |

Use repository-confirmed paths only. Avoid repeating one image everywhere when approved alternatives exist.

### 4. Make the integrated change

Use one branch based on current `main` and update the full approved page set together. Preserve:

- Customer Portal security;
- authentication and roles;
- Apps Script project and deployment IDs;
- approval gates;
- no-automatic-charge controls;
- pricing and product decisions unless specifically included in scope;
- existing production URLs.

A public redesign must not silently become a platform or portal rewrite.

### 5. Normalize asset references

For the approved logo:

- use the manifest `public_reference` everywhere;
- use the exact approved alt text;
- preserve aspect ratio;
- keep the visible business name beside it;
- never substitute another image on load failure.

Derive the cache key from the approved asset state, preferably the approval date plus a short Git blob prefix. Update all affected public references in the same build.

### 6. Run the permanent gates

At minimum run:

```bash
python3 scripts/verify-public-images.py
```

The verifier must confirm:

- the canonical logo file is a real image;
- its Git blob SHA matches the manifest;
- public pages use the controlled cache key;
- forbidden substitute paths are absent;
- content images exist and load from valid repository paths;
- alt text is present;
- major pages are not image-poor.

Also run the normal repository test and acceptance workflows for the pages and applications touched.

### 7. Merge and observe deployment

- Open a PR.
- Confirm the permanent checks pass.
- Merge to `main`.
- Observe the **main-branch** GitHub Pages run.
- Record the successful run ID and deployed source SHA.
- Verify the live page using `?v=<merge-or-deploy-sha>`.

Do not claim deployment from a merged PR alone.

## When the live site still looks old

Do not keep rewriting correct source files.

Check in this order:

1. `main` contains the intended page and exact asset binary.
2. `.github/workflows/pages.yml` checks out current `main`.
3. The Pages workflow staged the current source.
4. The deployment job completed successfully.
5. The live URL is opened with a new cache-busting query.
6. The browser receives the new HTML reference and new asset bytes.

If run visibility is missing, add a temporary deployment-result recorder, obtain the exact run ID and conclusion, then remove the recorder after the clean deployment. Temporary deployment diagnostics must not become permanent product architecture.

## Speed rules

- Reuse the approved asset manifest instead of guessing paths.
- Batch related page changes into one integrated PR.
- Use shared CSS and JavaScript instead of duplicate inline systems.
- Search the repository once for every old asset reference, then replace all in scope.
- Use the asset Git blob prefix as the cache marker so the browser and source stay traceable.
- Validate binary bytes before styling pages around them.
- Verify deployment separately from source correctness.
- Do not reopen approved logo, imagery, layout, pricing, or architecture decisions without a verified conflict.
- Remove one-time transfer and diagnostic files immediately after successful deployment.

## Fast failure rules

Stop and fix the process when:

- the exact approved binary is not accessible;
- a transfer route re-encodes or downsizes the image;
- the repository filename contains placeholder text instead of image bytes;
- the asset signature, dimensions, or manifest blob SHA do not match;
- a substitute image appears in JavaScript or CSS fallback behavior;
- a branch is not based on current `main`;
- a Pages run fails or deploys an older source SHA;
- protected portal or application routes change outside the approved scope.

## Completion standard

A visual build is complete only when all of the following are true:

- exact approved binaries are in `main`;
- the manifest matches the binaries;
- all in-scope pages use the controlled references;
- permanent image and application checks pass;
- the PR is merged;
- the main-branch Pages deployment succeeds;
- cache-busted live verification shows the intended page and imagery;
- temporary transfer and diagnostic machinery is removed;
- the final merge/deployment SHA is recorded for rollback.
