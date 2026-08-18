-- Remove Supabase default privileges that are not needed by Reseller Scout.
revoke all on table public.reseller_deals from authenticated;
revoke all on table public.reseller_watch_rules from authenticated;

grant select, insert, update, delete on table public.reseller_deals to authenticated;
grant select, insert, update, delete on table public.reseller_watch_rules to authenticated;
