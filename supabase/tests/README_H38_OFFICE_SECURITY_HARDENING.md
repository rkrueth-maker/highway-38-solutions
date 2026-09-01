# H38 Office security hardening checks

`h38_office_security_hardening.sql` is intentionally read-only. Run it only after the matching migration has been applied to a disposable or approved target. Expected results:

- `anon_*` privilege columns: `false`
- `authenticated_*` privilege columns: `true`
- `sanitize_reseller_store_discovery_tiles` `proconfig` contains `search_path=pg_catalog, public`

These checks do not constitute physical-phone acceptance.
