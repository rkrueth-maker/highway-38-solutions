# Highway 38 Visual Release Standard

1. Visual, image, layout, and UI changes never go directly to `main`; use one controlled branch and one integrated pull request.
2. Photographic project images must be direct PNG, JPEG, or WebP files. SVG may be used for true diagrams or line art, but may not wrap, embed, or reference raster photographs.
3. The page, canonical image manifest, verifier, PR browser checks, deployment checks, and rollback notes change together.
4. Before merge, Chromium captures full-page desktop and mobile screenshots plus every affected image.
5. Checks verify load completion, natural dimensions, direct-raster type, nonblank pixel variance, visual detail, and declared same-property continuity.
6. Production repeats the same checks against the cache-busted live URL and exact deployed SHA.
7. Automation may report `TECHNICAL PASS`; it may not report Rick visual acceptance. Visual acceptance requires Rick to review the rendered screenshot or live page and explicitly accept it.
8. Blank panels, wrong properties, duplicate labels, cartoon replacements for photos, and mismatched quote/visual scope are release blockers even when paths and HTTP checks pass.
9. Temporary transfer or repair workflows are removed before merge.
10. A visual release is complete only after PR checks, merge, exact-commit Pages deployment, live pixel checks, and Rick review.
