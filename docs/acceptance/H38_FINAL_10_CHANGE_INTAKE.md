# H38 final 10/10 polish change intake

Date: 2026-09-20

## Ten-line change brief

1. Outcome: make the existing Business Office feel finished without adding a competing runtime or changing tenant/auth boundaries.
2. Primary UX: one canonical Customer 360 with a compact customer directory on the left and one selected customer workspace on the right.
3. Customer workspace: keep Overview, Work, Money, and Files as the only persistent detail regions.
4. Remove duplication: timeline, photo stream, setup forms, and customer cards must not render as separate full-width sections around Customer 360.
5. Phone finish: keep five primary navigation labels readable at 320 CSS px and reserve a consistent safe zone above fixed controls.
6. Upload finish: retain the current upload authority and make analyzer state/results explicit; do not invent extracted data.
7. Assistant/meetings: preserve the current guarded actions while making selected customer/job context visible.
8. Workflow proof: use controlled TEST records and real runtime browser recordings; training evidence is not production acceptance evidence.
9. Safety: no automatic customer sending, approval, purchasing, payment, or cross-tenant record creation.
10. Release: feature branch and one PR only; merge only after exact-head checks and deployed verification are green.

## Module intake

- Route/module: authenticated Business Office — Customers, Today/mobile shell, Documents/Smart Upload, Meetings/Assistant, workflow recording.
- Canonical owners: `customer-360-authority.js`, `customer-workspace-documents.js`, existing photo/timeline integrations, phone runtime authority, existing upload/assistant runtimes.
- Today critical path: Customer 360 is on-demand; phone navigation/safe-zone CSS is shell-critical and must remain small and synchronous.
- Data source: the already-loaded business snapshot and existing queued operations. No new startup RPC or schema dependency.
- First render target: no new network request; reuse the current snapshot and existing render lifecycle.
- Cache/offline behavior: unchanged. Local snapshot and operation queue remain authoritative for offline-capable actions.
- Roles/permissions: existing Customer 360 Money visibility and owner approval gates remain unchanged.
- External side effects: none added. Documents remain private by default; invoices remain drafts requiring owner approval; no messages are sent.
- Tenant boundary: all selection and writes remain scoped to the active business ID; TEST scenario data must remain inside its active tenant.
- Verification owner: governance checks, targeted Customer 360/phone/upload/assistant browser verifiers, visual screenshots, exact deployed commit and health checks.
- Rollback: revert this feature-branch commit/PR; no migration or irreversible data operation is introduced.
