revoke execute on function public.h38_penny_cache_feed() from public;
revoke execute on function public.h38_penny_cache_feed() from anon;
grant execute on function public.h38_penny_cache_feed() to authenticated;
grant execute on function public.h38_penny_cache_feed() to service_role;
