#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260901173000_h38_office_security_hardening.sql'), 'utf8');
const failures = [];

for (const marker of [
  'revoke execute on function public.activate_client_business(uuid) from anon, public;',
  'revoke execute on function public.provision_client_business(text, text, text, text, text, jsonb, text[], text, text) from anon, public;',
  'revoke execute on function public.customer_portal_decide_quote(uuid, integer, text, text) from anon, public;',
  'grant execute on function public.customer_portal_decide_quote(uuid, integer, text, text) to authenticated;',
  'alter function public.sanitize_reseller_store_discovery_tiles() set search_path = pg_catalog, public;'
]) {
  if (!migration.includes(marker)) failures.push(`missing hardening marker: ${marker}`);
}

for (const forbidden of [
  /revoke\s+execute\s+on\s+function\s+public\.customer_portal_decide_quote[\s\S]*?from\s+authenticated/i,
  /grant\s+execute\s+on\s+function[\s\S]*?to\s+anon/i,
  /service_role/i
]) {
  if (forbidden.test(migration)) failures.push(`forbidden migration pattern: ${forbidden}`);
}

if (failures.length) {
  console.error('H38 Office Supabase hardening verifier: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('H38 Office Supabase hardening verifier: PASS');
