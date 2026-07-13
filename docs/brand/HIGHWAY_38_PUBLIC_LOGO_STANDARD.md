# Highway 38 Public Logo Standard

Status: CONTROLLED  
Brand authority: 01 — Command Center  
Documentation owner: 03 — Operations & Documentation  
Technical implementation owner: 02 — Build & Automation  
Effective date: 2026-07-13

## Approved public logo

The only approved public Highway 38 logo is the **second mountain-and-road Highway 38 Solutions badge**.

Controlled implementation values:

- asset path: `assets/highway38-logo.png`
- approved cache key: `20260713-logo2`
- approved public reference: `assets/highway38-logo.png?v=20260713-logo2`
- required alt text: `Highway 38 Solutions`
- visible text fallback: `Highway 38 Solutions` must remain beside the image

The visible fallback is required so the business name remains readable when the image is unavailable, blocked, delayed, or not interpreted by assistive technology.

## Retired logo states

The following are retired and must not be reintroduced:

- the first H38 swoosh logo;
- the third logo;
- cache keys `20260713-logo1` and `20260713-logo3`;
- retired public logo references, including legacy swoosh, badge, or mark assets used as alternate primary branding.

No alternate public logo may be introduced without explicit 01 — Command Center approval and a corresponding update to this controlled standard.

## Required locations

The approved lockup must be used wherever public primary branding appears, including:

- shared navigation;
- shared footer;
- legacy brand anchors;
- fallback headers;
- homepage primary branding;
- the 404 page;
- older-page headers and footers;
- public tool and proof pages;
- customer-facing portal entry branding when applicable.

A page that displays only a retired mark, an unapproved alternate mark, or no approved logo where a primary brand lockup is required is noncompliant.

## Required behavior

- Preserve the original image aspect ratio.
- Use responsive width and automatic height.
- Preserve readability at mobile sizes.
- Do not crop the mountain, road, shield/badge boundary, or business name.
- Do not place the image over a background that destroys legibility.
- Keep the visible text fallback beside the image.
- Keep the exact alt text `Highway 38 Solutions`.
- Use the controlled cache key when the approved asset is referenced publicly.

## Verification procedure

For every branding closeout:

1. confirm `assets/highway38-logo.png` exists in `origin/main`;
2. confirm the public references use `?v=20260713-logo2`;
3. confirm alt text is exactly `Highway 38 Solutions`;
4. confirm visible text fallback remains present;
5. search current public source for retired cache keys and retired logo paths;
6. inspect shared and legacy brand locations;
7. verify mobile readability;
8. verify the public pages independently with cache-busted URLs; and
9. report LOCAL, ORIGIN_MAIN, and LIVE_PAGES separately.

## Controlling branding commit

The approved second-logo production state was established by commit:

`4850f074718773ca950d22dbe30444f109634232` — **Use only the approved second logo across the public site**

Later changes must preserve this standard. A later content correction that removes or bypasses the approved lockup creates a technical compliance defect; it does not authorize a different logo standard.

## Change control

03 documents the standard and records compliance findings. 02 owns source corrections, shared component changes, deployment, and technical verification. 01 approves any change to the logo choice, asset path, cache key, alt text, fallback requirement, or public branding policy.
