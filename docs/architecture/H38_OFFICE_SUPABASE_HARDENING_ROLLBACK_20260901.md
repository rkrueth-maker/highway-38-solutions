# H38 Office Supabase hardening rollback

If the migration causes an unexpected authorization regression, restore the previous grants for the affected authenticated workflow rather than weakening RLS or introducing a new bypass. Do not grant Office/customer RPC execution to `anon` or `PUBLIC` as a rollback shortcut. Revert only the specific privilege/search-path change that is proven to cause the regression, then re-run the focused verifier and Supabase advisors.
