# Northern Lakes Narrated Training Library

This library records real Northern Lakes Property Maintenance workflows from the deployed shared Business Office and Northern public pages. It is instructional evidence, not a mock interface.

## Current shared-folder authority

Northern Lakes current training belongs in the existing shared Drive folder **Northern Lakes — Current Training**:

https://drive.google.com/drive/folders/1goznCyh2_FDYKHqgMk7halig03TNABPm

Use `docs/training/TRAINING_VIDEO_UPDATE_RULES.md` for all future maintenance. Replace existing lesson files in place when possible so shared Drive links remain stable. Regenerate only the changed workflow videos and affected master videos by default; do not rerun the full Northern library unless a shared privacy, recorder, narrator, branding/navigation, authentication/session, or equivalent library-wide change invalidates prior media.

## Narration

Narration uses a generic deep, calm, warm male system voice generated locally during CI. It must not imitate or claim to be any real person or public figure.

## Workflow coverage

1. Daily owner workflow
2. Customer and property setup
3. Quote to job
4. Schedule and dispatch
5. Lawn service lifecycle
6. Snow service lifecycle
7. Job closeout, invoicing, and payment recording
8. Receipts and expenses
9. Documents and Smart Upload
10. People, roles, and task handoff
11. Fleet, equipment, and inventory/materials
12. Billing, accounting, payroll prep, tax prep, and reports
13. AI assistant approvals and Controls
14. Recurring lawn and snow service subscriptions
15. Messages and field issues
16. Public website estimate request
17. Customer Portal access
18. Owner access and phone installation

## Safety rules

- Use controlled TEST records where tenant records are shown.
- Blur detected live customer/property data in recorded Office views.
- Do not send customer messages, charge or record fake payments, purchase anything, or trigger external scheduling actions.
- A prepared quote or invoice is not automatically sent.
- Mark an invoice paid only after a real payment has been received and verified.
- Keep H38 and Northern tenant data isolated while sharing the same Office engine.

## Output

The GitHub Actions workflow `Northern Lakes Narrated Training Videos` produces narrated MP4 files, matching caption/audio metadata, a manifest, results JSON, and an artifact README. The workflow hard-fails unless at least 18 narrated videos pass and `externalActionsOccurred` remains false.

The current three master packages contain 39 lessons: 20 operator, 16 owner/accounting/AI, and three reference. The Customer Portal reference shows the access route; it is not a signed-in customer permission test. Authenticated Staff completion is proven by the separate strict complete-training workflow with a TEST Staff membership. Client-owned Google Drive remains gated, so no lesson claims a completed Drive connection. Add a connected-provider recording only after that integration passes tenant-specific acceptance.
