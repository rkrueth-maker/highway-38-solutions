#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260804232100_multitenant_platform_foundation.sql'
);

if (!fs.existsSync(migrationPath)) {
  throw new Error(`Missing migration: ${migrationPath}`);
}

const sql = fs.readFileSync(migrationPath, 'utf8');
const failures = [];

const requiredTables = [
  'businesses',
  'profiles',
  'business_memberships',
  'business_invitations',
  'business_modules',
  'approval_requests',
  'proof_log',
  'error_log',
  'external_action_queue',
];

for (const table of requiredTables) {
  if (!new RegExp(`create table if not exists public\\.${table}\\b`, 'i').test(sql)) {
    failures.push(`missing required table public.${table}`);
  }
  if (!new RegExp(`alter table public\\.${table} enable row level security`, 'i').test(sql)) {
    failures.push(`RLS is not enabled for public.${table}`);
  }
}

const requiredPatterns = [
  ['business tenant key', /business_key text not null unique/i],
  ['membership user and business uniqueness', /unique\s*\(business_id, user_id\)/i],
  ['approved roles', /owner.*administrator.*staff.*viewer/is],
  ['authenticated tenant predicate', /private\.is_business_member\(business_id\)/i],
  ['owner/admin predicate', /private\.has_business_role\([^;]+owner[^;]+administrator/is],
  ['no anonymous table access', /revoke all on all tables in schema public from anon/i],
  ['external action approval link', /approval_request_id uuid references public\.approval_requests/i],
  ['external action safety constraint', /external_action_requires_approval/i],
  ['no service-role browser guidance', /revoke all on function private\.membership_role\(uuid\) from public/i],
];

for (const [label, pattern] of requiredPatterns) {
  if (!pattern.test(sql)) failures.push(`missing ${label}`);
}

const forbiddenPatterns = [
  ['automatic external-action trigger', /create\s+trigger[^;]+external_action/is],
  ['automatic approval trigger', /create\s+trigger[^;]+approval/is],
  ['anonymous grant', /grant\s+.+\s+to\s+anon/i],
  ['browser service role', /service_role/i],
  ['user metadata authorization', /user_metadata|raw_user_meta_data/i],
];

for (const [label, pattern] of forbiddenPatterns) {
  if (pattern.test(sql)) failures.push(`forbidden pattern found: ${label}`);
}

if (failures.length) {
  console.error('Supabase multitenant foundation verification FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Supabase multitenant foundation verification PASSED');
console.log(`Verified ${requiredTables.length} tenant/security tables with RLS.`);
console.log('Verified anonymous access remains revoked.');
console.log('Verified external actions remain approval-gated and inert.');
