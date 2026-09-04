-- Cover business_data_import_rows.business_id FK for tenant-scoped import cleanup and joins.
create index if not exists business_data_import_rows_business_id_idx
on public.business_data_import_rows(business_id);
