# Northern Lakes Rendered Photo Verification

Every Northern Lakes HTML page must be rendered at desktop and mobile sizes before photo changes are accepted.

The verification captures:

- opening-screen screenshot
- full-page screenshot
- every visible rendered image
- broken image and failed asset checks
- effective rendered-resolution checks that account for `object-fit`
- duplicate source inventory
- homepage Duramax and BOSS plow opening-image contract

Run:

```bash
node scripts/audit-northern-lakes-rendered-photos.js
```

Acceptance requires:

- every HTML page rendered at desktop and mobile sizes
- zero broken or failed image assets
- zero under-resolved visible photos
- zero missing visible-image alt labels
- visual inspection of the desktop and mobile opening-screen contact sheets

Artifacts are written to `artifacts/northern-lakes-photo-audit/` and uploaded by the `Northern Lakes Rendered Photo Audit` GitHub Actions workflow.
