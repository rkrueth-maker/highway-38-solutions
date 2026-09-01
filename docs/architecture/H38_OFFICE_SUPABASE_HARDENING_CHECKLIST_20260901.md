# H38 Office Supabase hardening checklist

- [ ] Confirm current `main` still matches the PR base or rebase before merge.
- [ ] Run repository change-governance checks required by `AGENTS.md`.
- [ ] Run `node scripts/verify-h38-office-supabase-hardening.js`.
- [ ] Inspect exact-head GitHub Actions results.
- [ ] Validate platform-owner authorization inside the private tenant-management functions.
- [ ] Validate customer portal RPCs still bind records to `auth.uid()`.
- [ ] Apply migration only after exact-head checks are acceptable.
- [ ] Re-run Supabase security and performance advisors after migration.
- [ ] Verify live privileges with read-only SQL.
- [ ] Keep automatic approval, customer sending, purchasing, payment, and scheduling disabled.
- [ ] Physical Android phone behavior remains NOT YET PROVEN until tested.
