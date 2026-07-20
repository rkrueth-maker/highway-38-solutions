# Highway 38 Public Logo Standard

Status: CONTROLLED  
Brand authority: Rick Krueth / 01 — Command Center  
Documentation owner: 03 — Operations & Documentation  
Technical implementation owner: 02 — Build & Automation  
Effective controlled-binary update: 2026-07-20

## Approved public logo

The only approved public Highway 38 logo is the exact owner-approved mountain-and-road Highway 38 Solutions badge stored at the canonical asset path.

Controlled implementation values:

- Asset path: `assets/highway38-logo.png`
- Exact Git blob SHA: `0cbc4514e645dfb25c12ee393b3633a145ebeb2a`
- Approved cache key: `20260720-exact-0cbc4514`
- Approved public reference: `assets/highway38-logo.png?v=20260720-exact-0cbc4514`
- Required alt text: `Highway 38 Solutions`
- Visible text fallback: `Highway 38 Solutions`
- Image substitution allowed: **No**
- Machine-readable control: `scripts/config/approved-public-assets.json`

The visible text fallback is required so the business name remains readable when the image is unavailable, blocked, delayed, or not interpreted by assistive technology. It is text beside the approved image, not a substitute image.

## Controlled-binary rule

The approved logo is a controlled binary, not a visual direction.

Without Rick's explicit approval, do not:

- redraw or regenerate it;
- recolor, crop, trace, restyle, or approximate it;
- use a screenshot, thumbnail, rendering, or generated version;
- re-encode or downsize it during transfer;
- replace it with another repository image;
- use another image as a loading fallback;
- change only the filename or cache key while leaving different bytes in place.

The actual binary must match the manifest Git blob SHA.

## Retired logo states

The following are retired and must not be reintroduced:

- the earlier H38 swoosh logo;
- alternate uploaded or generated logo variants;
- the route-shield image `assets/command-center/cc-42.webp` as public branding or fallback;
- cache keys `20260713-logo1`, `20260713-logo2`, and `20260713-logo3`;
- any legacy swoosh, badge, route marker, or reconstructed mark used as alternate primary branding.

No alternate public logo may be introduced without Rick's explicit approval and a corresponding update to the binary, manifest, cache key, controlled documentation, and verification expectations.

## Required locations

The approved lockup must be used wherever public primary branding appears, including:

- shared navigation;
- shared footer;
- legacy brand anchors still in public scope;
- homepage primary branding;
- the 404 page;
- older-page headers and footers that remain public;
- public tool and proof pages;
- customer-facing portal entry branding when applicable.

A page that displays a retired mark, an unapproved alternate mark, a substitute image, or no approved logo where a primary lockup is required is noncompliant.

## Required behavior

- Preserve the original aspect ratio.
- Use responsive width and automatic height.
- Preserve readability at mobile sizes.
- Do not crop the mountain, road, badge boundary, business name, or tagline.
- Do not place the image over a background that destroys legibility.
- Keep the visible text fallback beside the image.
- Keep the exact alt text `Highway 38 Solutions`.
- Use the controlled cache key when the approved asset is referenced publicly.
- On image-load failure, preserve the text fallback and hide the broken image; do not load a different image.

## Approved transfer procedure

Use the first available safe route:

1. current-conversation attachment with a usable local path;
2. connector-native file transfer without re-encoding;
3. temporary hosted-source transfer through a one-time PR workflow.

A one-time workflow must validate the file signature, dimensions, size, and hash; commit only the approved binary to the PR branch; and be removed after the verified production deployment.

See `docs/public-website/APPROVED_ASSET_FAST_PATH.md`.

## Verification procedure

For every branding closeout:

1. load `scripts/config/approved-public-assets.json`;
2. confirm `assets/highway38-logo.png` exists in the target branch and `main`;
3. compute the actual Git blob SHA and compare it with the manifest;
4. confirm controlled public references use `?v=20260720-exact-0cbc4514`;
5. confirm alt text is exactly `Highway 38 Solutions`;
6. confirm the visible text fallback remains present;
7. search current source for retired cache keys and forbidden substitute paths;
8. inspect shared and legacy brand locations;
9. run `python3 scripts/verify-public-images.py`;
10. verify mobile readability;
11. verify the main-branch Pages deployment succeeds; and
12. report LOCAL, ORIGIN_MAIN, and LIVE_PAGES separately.

## Controlling release

The exact approved binary and no-substitute public release was established by:

`9679b4b83b2685a67f48295d22346b83702da154` — **Finalize exact approved Highway 38 logo deployment**

The exact approved asset Git blob is:

`0cbc4514e645dfb25c12ee393b3633a145ebeb2a`

Later changes must preserve this controlled state unless Rick explicitly approves a replacement.

## Change control

03 documents the standard and records compliance findings. 02 owns source corrections, shared component changes, deployment, and technical verification. Rick / 01 approves any change to the logo choice, binary, asset path, cache key, alt text, fallback behavior, or public branding policy.
