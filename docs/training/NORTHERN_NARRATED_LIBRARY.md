# Northern Lakes Narrated Training Library

This library records real Northern Lakes Property Maintenance workflows from the deployed shared Business Office and Northern public pages. It is instructional evidence, not a mock interface.

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
