# H38 Final Real-Life Acceptance

This is the repeatable acceptance playbook for Highway 38 and Northern Lakes Business Office. Use fictional records marked `TEST`. Never use real customer PII, payments, purchases, schedules, or customer delivery.

## Prerequisites

- Owner test user plus one permission-limited field user.
- Controlled email identities: `highway38solutions@gmail.com` and `rkrueth@gmail.com` only.
- Every email subject begins `[H38 TEST]`.
- Authorized real test photographs. Repository fixtures include `assets/contractor-demo/driveway-before.jpg` and `assets/contractor-demo/flower-after.png`.
- Phone widths 320 and 390, tablet 820×1180, Chromebook 1366×768, desktop 1440×900, and the available Android/iPhone hardware.

## Test records

- `Pine Ridge Test Customer` / Alex Pine / 4827 Test Lake Rd.
- `Pine Ridge Garage Improvement — TEST`.
- `Maple View Test Property — TEST` recurring lawn service.
- `North Ridge Test Shop — TEST` snow service with truck, skid-steer, and driveway/lot areas.

## Required workflows

1. Meeting: create the Pine Ridge meeting, type or record notes, pause/resume when supported, add a note/photo/file, finish and organize, reopen the Meeting Report, print it, prepare follow-up/customer/property/request/quote context, and confirm no automatic send.
2. Quote: link Customer and property, attach authorized before/after photographs, preserve measurements and notes, create priced lines, save draft, generate/open/print the customer-ready document, and prepare—not automatically send—the controlled test email.
3. Smart Upload: test photo, before/after evidence, receipt, vendor invoice, contract, quote attachment, equipment document, Site Visit evidence, Meeting attachment, and PDF. Record source, detected type, confidence, proposed Customer/Job/Quote, confirmation, final placement, and visibility in Customer 360, Job, Documents, and financial record when applicable.
4. Lawn: recurring schedule → assignment → My Day → travel/arrival/start → mow/trim/blow-off → proof → closeout → completion → invoice preparation. Confirm the Customer 360 activity and Assistant summary.
5. Snow: trigger/assignment → travel/arrival/start → truck area → skid-steer area → driveway/lot → material if used → proof/closeout → invoice preparation. Test per-occurrence and hourly preparation without money movement.
6. Assistant: from Today, Customer, Job, Site Visit, Quote, Messages, Meeting, Document, snow, and lawn, ask the context-specific prompts in the takeover request. The response must use the open record and keep external execution approval-gated.
7. Context: prove Job → Message → Job, Job → Site Visit → Job, Customer → Document → Customer, and Search → Record → Search, including record and query restoration.
8. Offline: save locally, reopen/resume, reconnect, retry, and verify visible `Saved`, `Syncing`, `Offline — saved locally`, or `Sync failed — safe locally · Retry` status.

## Visual and accessibility checks

At every viewport confirm one Customer 360, identifiable five-item phone navigation, 44px or larger touch targets, visible focus, no horizontal clipping, 16px iPhone form inputs, safe areas, and no floating `+` overlap with any final action or bottom navigation.

Run:

```bash
node scripts/verify-final-95-contract.js
node scripts/verify-context-continuity.js
node scripts/verify-context-continuity-browser.js
node scripts/verify-final-95-acceptance-browser.js
```

CI stores screenshots and video under `artifacts/final-95/`. Device recordings should use descriptive `h38-final-test-*.mp4` or `.webm` names and contain TEST data only.

## Placement matrix

For each uploaded file record: entry point, detected type, confidence, Customer, property, Job, Quote/Invoice/Expense, proposed destination, confirmed destination, and where it appears. Uncertain or high-impact associations require confirmation; retain the original file.

## Email loop

Test H38 → personal, personal → H38, H38 reply, threading, unread/read, Customer/Job association, Assistant summary, draft reply, and explicit send. Record sender, recipient, subject, timestamp, Customer, Job, Quote, and Office thread. No fictional or real customer addresses.

## Cleanup

Archive or delete only the controlled TEST records through normal authorized controls. Preserve Proof/Error/Audit logs. Remove test schedules, queued drafts, local media, and email drafts; never remove production customer records. Record physical Android, physical iPhone/LiDAR, Apple signing/TestFlight, real Gmail delivery, camera, microphone, and location as external gates when unavailable.
