-- Allow the owning business's Owner/Administrator to open customer-facing PDF files
-- without weakening customer-to-customer or tenant-to-tenant isolation.

drop policy if exists "business admins read customer portal objects" on storage.objects;

create policy "business admins read customer portal objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'customer-portal'
  and coalesce((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.customer_accounts ca
    where ca.id = ((storage.foldername(name))[1])::uuid
      and (select private.business_access(ca.business_id, array['owner','administrator']::text[]))
  )
);
