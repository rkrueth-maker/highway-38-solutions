# Highway 38 Web Image Deployment Playbook

## Purpose

Use this process for every Highway 38 public-site build, rebuild, or image-heavy release so approved visuals move to production quickly, remain exact, and are easy to verify and roll back.

The short operational version is `docs/public-website/APPROVED_ASSET_FAST_PATH.md`.

## Sources of truth

- Machine-readable approved asset manifest: `scripts/config/approved-public-assets.json`
- Approved master logo: `assets/highway38-logo.png`
- Approved public imagery: `assets/approved-website-images/`
- Shared public styling: `assets/css/h38-site-v2.css`
- Shared public behavior: `assets/js/h38-site-v2.js`
- Production branch: `main`
- Production host: `https://rkrueth-maker.github.io/highway-38-solutions/`
- Deployment workflow: `.github/workflows/pages.yml`

Do not add logo variants or use imagery outside the approved source set without owner approval.

## Controlled-binary rule

Approved logos and images are controlled binaries.

Do not:

- redraw or regenerate them;
- crop, recolor, trace, restyle, or approximate them;
- use screenshots or thumbnails as replacements;
- re-encode them during transfer unless specifically approved;
- use another image as a loading fallback;
- assume a familiar filename contains the correct bytes.

Validate the file signature, size, dimensions, and manifest Git blob SHA before building pages around it.

## Fast approved-asset intake

Use this order:

1. direct current-conversation file path;
2. connector-native file transfer;
3. one-time PR workflow downloading an exact temporary hosted source.

A one-time transfer workflow must:

- run on the PR branch;
- download only the approved asset;
- validate the binary before commit;
- commit only the intended binary;
- expose a visible workflow result;
- be removed after the verified production deployment.

Do not change page design or use a substitute because the preferred transfer route failed.

## Required page image pattern

Every major public page must include:

1. the approved logo in the shared header;
2. at least one explicit non-logo content image using `<img>`;
3. descriptive alt text;
4. a repository-relative asset path;
5. the manifest cache key on controlled logo references;
6. a shared, responsive presentation pattern.

Do not rely on a CSS background as the only visible content image.

## Preferred visual structures

Use repeatable patterns rather than inventing a different system per page:

- hero plus three-image proof strip;
- two-column text and image section;
- three-image visual grid with captions;
- card grid with one image per solution card;
- project sequence: existing condition → visual concept → plan/scope → quote/manage;
- application preview plus workflow explanation.

## Approved image selection rules

Choose imagery by page purpose:

- Property and construction: exterior shop, project documents, site, layout, or planning imagery
- Garages and shops: garage zones, clean shop floor, storage, work zones, and material flow
- CNC and manufacturing: CNC closeup, fixtures, tooling, production, and automation
- Automation and process: machinery, workflow, sensors, integration, and process imagery
- Business systems: business workflow office and organized digital records
- Intake and quoting: request checklist, measurements, planning documents, and field capture
- Proof and examples: before/current state, concept, plan, scope, and managed outcome

Avoid repeating the same content image more than twice on one page when approved alternatives exist.

## Integrated build workflow

### 1. Preflight once

Before editing:

- create a clean branch from current `main`;
- inspect shared CSS, JavaScript, header, footer, and navigation;
- inspect the current Pages workflow;
- inventory approved image paths;
- identify every in-scope public page;
- identify protected application routes and external URLs.

### 2. Create the page-to-image map

Decide which approved image belongs on each page before writing markup. This prevents repeated asset searching and accidental image duplication.

### 3. Update the shared shell first

When several pages need the same visual improvement, change the shared CSS or JavaScript first. Then apply the same approved header, footer, grid, card, and responsive structure across the page set.

### 4. Build the complete approved page set

Update all related pages in one integrated branch. Preserve:

- Customer Portal security;
- authentication and user roles;
- existing Apps Script project and deployment IDs;
- approval gates;
- no-automatic-charge controls;
- pricing and product decisions outside the approved scope;
- production routes and data isolation.

### 5. Normalize controlled references

Read the manifest and use its values exactly:

- `path`
- `public_reference`
- `cache_key`
- `alt_text`
- `visible_text_fallback`
- `allow_image_substitute`

The cache key should identify the approved binary state, preferably using the approval date and a short Git blob prefix.

### 6. Run permanent verification

Run:

```bash
python3 scripts/verify-public-images.py
```

Fix all errors before opening the PR. The script must reject:

- a missing or fake image file;
- a logo binary that does not match the manifest;
- stale controlled cache keys;
- forbidden substitute logo paths;
- broken repository image paths;
- missing alt text;
- image-poor major pages.

Run the other repository tests and acceptance workflows required by the pages and applications touched.

### 7. PR and merge

- Open one PR for the integrated visual release.
- Review changed filenames and scope.
- Confirm permanent workflows pass.
- Merge to `main`.
- Record the merge commit as the rollback boundary.

### 8. Verify deployment, not just source

A successful merge is not proof of publication.

Confirm:

1. the main-branch Pages workflow ran;
2. it checked out current `main`;
3. the staged artifact includes the intended HTML and approved assets;
4. the deployment completed successfully;
5. the live URL is opened with `?v=<deploy-or-merge-sha>`;
6. the live HTML references the manifest-controlled asset;
7. desktop and mobile show the intended imagery.

When Pages run visibility is insufficient, use a temporary deployment-result recorder. Remove it after the clean deployment is proven.

## Live visual inspection

Check:

- exact approved logo visible;
- no substitute logo;
- image loading and correct paths;
- intentional crop and object positioning;
- text contrast;
- consistent card heights;
- no horizontal overflow;
- usable mobile navigation;
- no stretched logo or content image;
- protected links still point to the approved destinations.

## Release checklist

- [ ] Branch created from current `main`
- [ ] Approved asset manifest read before editing
- [ ] Exact approved logo binary verified
- [ ] Page-to-image map completed
- [ ] Shared shell reused
- [ ] Correct approved logo on every updated page
- [ ] No substitute-logo fallback
- [ ] No broken image paths
- [ ] Main content contains explicit visible imagery
- [ ] Alt text describes the actual purpose
- [ ] Controlled references use the manifest cache key
- [ ] Mobile layout checked
- [ ] Desktop layout checked
- [ ] Old catalog or stale navigation links removed or redirected when in scope
- [ ] Customer Portal, Quote Builder, Business Office, and Apps Script destinations preserved
- [ ] Permanent CI checks passed
- [ ] PR merged to `main`
- [ ] Main-branch Pages run completed successfully
- [ ] Cache-busted live verification completed
- [ ] Temporary transfer and diagnostic machinery removed
- [ ] Rollback commit recorded

## Fast failure rules

Do not publish when:

- the exact approved binary is inaccessible;
- the transfer route re-encodes or downsizes it;
- the repository asset contains placeholder text instead of image bytes;
- the manifest and actual Git blob SHA disagree;
- a substitute logo path appears in JavaScript, CSS, or HTML;
- an image path is not confirmed in the repository;
- a major page contains only logo imagery;
- a hero relies only on CSS background imagery;
- protected customer-facing routes changed unintentionally;
- the Pages run failed or deployed an older source SHA.

## Troubleshooting order

When live looks wrong, inspect in this order:

1. approved binary in the PR branch;
2. manifest values;
3. page references;
4. permanent image verification;
5. merge result in `main`;
6. Pages checkout and staged artifact;
7. Pages deployment conclusion;
8. cache-busted live HTML and asset response.

Do not keep changing correct source files to compensate for a deployment-pipeline problem.

## Rollback

Use the visual release merge commit as the rollback boundary. Revert the merge commit rather than manually undoing individual files. Preserve the last verified approved asset binary and manifest together.
