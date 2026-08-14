-- Allow real-world H38 Site Visit walkthroughs to exceed the original 50 MB
-- Site Scanner foundation cap. The Android capture remains private, tenant-scoped,
-- owner-review-only evidence; this change does not approve, send, purchase, charge,
-- schedule, publish, or otherwise create an external action.

update storage.buckets
set file_size_limit = 524288000,
    updated_at = now()
where id = 'business-office-files';
