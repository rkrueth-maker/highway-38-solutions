# Highway 38 Asset Handoff

This file is the durable source of truth for public website assets across chats and workstreams.

## Required workflow

1. Every accepted public asset must be stored in this repository under a stable, descriptive filename.
2. Do not rely on chat-generated file IDs, temporary previews, screenshots, unnamed UUID files, or another chat's context.
3. Record the page, project, source path, accepted commit, and replacement restrictions here before calling an asset complete.
4. Do not recreate, restyle, remove, or replace an accepted asset unless Rick explicitly approves the change or a verified defect requires correction.
5. Before deployment, verify the repository path, page reference, rendered result, and live GitHub Pages URL.
6. Handoffs must include this manifest path and the production commit.

## Project Examples visuals

Page: `sample-library-now.html`

Canonical direct visual files:

- `assets/demo-workthroughs/deck-existing-condition.webp`
- `assets/demo-workthroughs/deck-finished-concept.webp`
- `assets/demo-workthroughs/irrigation-before.webp`
- `assets/demo-workthroughs/irrigation-after.webp`
- `assets/demo-workthroughs/kitchen-existing-condition.webp`
- `assets/demo-workthroughs/kitchen-remodel-concept.webp`

Card mapping:

- Example 05 — 8 × 12 Pressure-Treated Deck — deck before and after files
- Example 06 — Four-Zone Residential Irrigation System — irrigation before and after files
- Example 07 — Mid-Range Kitchen Remodel — kitchen before and after files

Display implementation:

- The six files must remain ordinary `<img>` elements in `sample-library-now.html` and `contractor-quote-complete.html`.
- `contractor-demo.css` may size and crop those elements with `object-fit`, but must not hide them or replace them with a sprite, background image, remote URL, or generated fallback.
- `scripts/config/approved-public-image-placements.json` is the machine-readable placement authority.

Verified defect correction:

- The combined strip/background implementation produced blank and blurred crops at production card size.
- It was retired in favor of the direct approved image elements.
- The direct image paths, alt text, page placement, and visual role remain locked.

## Files not approved for public display

- `assets/demo-workthroughs/project-pairs-strip.svg`
- `assets/demo-workthroughs/project-pairs-sprite.webp`
- `assets/demo-workthroughs/deck-before.svg`
- `assets/demo-workthroughs/deck-after.svg`
- `assets/demo-workthroughs/irrigation-before.svg`
- `assets/demo-workthroughs/irrigation-after.svg`
- `assets/demo-workthroughs/kitchen-before.svg`
- `assets/demo-workthroughs/kitchen-after.svg`

These files may remain only for historical traceability. Public pages and styles must not reference them.