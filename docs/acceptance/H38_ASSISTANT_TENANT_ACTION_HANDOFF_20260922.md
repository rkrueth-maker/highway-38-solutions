# H38 Assistant Tenant-Aware Actions — Handoff and Acceptance

Date: 2026-09-22

## Central rule

**The existing H38 Assistant may operate the signed-in customer's own Business Office data under that user's existing permissions. It may not rewrite H38 Office, alter platform security, or cross tenant boundaries.**

H38 Office remains the system of record. The Assistant is an intelligent operator of existing Office functions. H38 product/source changes remain part of the private build/development workflow.

## Authority model

- The Assistant inherits the authority of the logged-in human and never receives a stronger role.
- Tenant/business context comes from the active authorized Office membership, never from prompt-supplied tenant IDs.
- Business-data actions resolve actual Office records and revalidate them in the active tenant.
- Product/source/security requests are not executed as tenant data changes.
- The cloud AI route remains advisory. Deterministic Office action execution is handled by `commercial-app/assistant-tenant-actions.js` through the existing Office operation queue.

## Consequential action lifecycle

1. Understand the request.
2. Resolve the active tenant and records.
3. Validate permissions, record state and business rules.
4. Preview the exact proposed change.
5. Require explicit approval where the operation is consequential.
6. Execute through existing Office functions/operation queue.
7. Refresh/read the saved state and verify.
8. Record proof/audit metadata.

Preview versions are binding. If a user changes the proposed value before approval, the old approval target is invalidated.

## Representative supported flows

- Customer service-rate change with before/after preview.
- Optional internal draft quote generated from the approved rate.
- Customer phone/contact correction.
- Bulk mowing/snow rate preview with projected before/after revenue and custom-contract exclusion/flagging.
- Product/UI suggestion captured for H38 review instead of modifying application code.
- Cancel before approval with no business-data write.
- Revise before approval and require approval of the new preview version.
- Owner-review escalation when the current role lacks the required capability.

## Hard blocks

Customer Assistant commands cannot:

- modify H38 JavaScript/source code;
- run migrations or change database schema;
- change RLS/security rules;
- grant permissions or elevate a role;
- switch to or inspect another tenant from prompt text;
- use unrestricted SQL;
- automatically approve their own restricted action;
- bypass existing Office validation or specialist business rules.

## Video-repair acceptance carried forward

Fresh workflow recordings must hold/fail if they show or detect:

- wrong customer in Site Visit → Quote;
- collapsed Customer 360 master/detail layout;
- unresolved sync failure at completion;
- misleading online/offline sync state;
- recorder-induced full-page viewport shrink/zoom flash;
- phone header/bottom-nav overlap or unreadable primary navigation;
- wrong Northern TEST customer at service billing review;
- auto-created invoice/payment/customer send where the scenario forbids it.

## AI live acceptance

The controlled deployed-Office Assistant acceptance covers:

- natural active-customer context;
- preview before write;
- approval-card stability;
- approved price change → draft quote → readback verification → proof log;
- cancel with no write;
- customer contact preview/cancel with no write;
- bulk price preview/cancel with no write;
- product request routed to suggestion;
- engine/permission attack blocked;
- cross-tenant prompt blocked;
- phone preview revision invalidating the prior approval target.

## Release rules

Before every repository write, refetch actual `main` and preserve intervening changes. Work on a feature branch. Merge only after exact-head checks are green. Workflow/video evidence uses controlled TEST data only and must not move real money or automatically send customer communications.
