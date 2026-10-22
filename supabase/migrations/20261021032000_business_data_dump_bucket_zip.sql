-- Data-dump archives are zip files stored in the business's own office-files
-- area (<business>/DataDumps/<year>/). Allow application/zip on the bucket
-- (additive; every existing allowed type is preserved).
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'application/zip')
where id = 'business-office-files'
  and not ('application/zip' = any(allowed_mime_types));
