---
name: h38-tenant-engine-protection
description: Preserve the shared Highway 38 Business Office engine while isolating tenant data, branding, configuration, roles, and customer-specific behavior. Use for H38, Northern Lakes, or any future Office tenant work.
---

1. Treat Highway 38 Business Office as one shared product engine.
2. Keep tenant-specific data, brand assets, pricing, services, settings, users, social accounts, and documents isolated by tenant/business scope.
3. Put shared behavior in canonical shared engine code. Do not fork a Northern-only or H38-only copy of a shared module to fix ordinary behavior.
4. Put legitimate tenant differences in tenant configuration/data, not duplicated application code.
5. Verify every read/write path scopes tenant-owned records correctly and respects role/action contracts.
6. Never use cross-tenant data as a fallback when tenant data is missing.
7. Preserve auditability for owner-approved changes, especially prices, quotes, invoices, payments, customer data, and AI-assisted edits.
8. For AI actions, allow a tenant assistant to propose or perform permitted changes to that tenant's own data only when the user has authority and required approval gates are satisfied. Do not let tenant AI modify the shared engine.
9. When a shared fix is made, verify at least H38 and Northern Lakes behavior if the change touches shared workflow, navigation, permissions, rendering, data access, or mobile UX.
10. Report whether each change is `ENGINE`, `TENANT CONFIG`, `TENANT DATA`, or `BRAND ASSET` so future agents do not duplicate the fix in the wrong layer.
