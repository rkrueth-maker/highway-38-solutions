-- Remove anonymous execution rights that Supabase may grant explicitly to
-- exposed SECURITY DEFINER functions. Signed-in quote approval remains
-- intentional and is protected by auth.uid(), customer ownership, quote
-- status, expected version, and duplicate-decision checks.

revoke execute on function public.customer_portal_customer_id() from anon;
revoke execute on function public.customer_portal_approve_quote(uuid, integer) from anon;
revoke execute on function public.customer_portal_customer_id() from public;
revoke execute on function public.customer_portal_approve_quote(uuid, integer) from public;

grant execute on function public.customer_portal_customer_id() to authenticated;
grant execute on function public.customer_portal_approve_quote(uuid, integer) to authenticated;
