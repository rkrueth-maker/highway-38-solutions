#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260804232100_multitenant_platform_foundation.sql'
);

if (!fs.existsSync(migrationPath)) throw new Error(`Missing migration: ${migrationPath}`);

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
  if (!new RegExp(`revoke all on table public\\.${table} from anon`, 'i').test(sql)) {
    failures.push(`anonymous privileges are not explicitly revoked for public.${table}`);
  }
}

const requiredPatterns = [
  ['business tenant key', /business_key text not null unique/i],
  ['membership uniqueness', /unique\s*\(business_id, user_id\)/i],
  ['approved roles', /owner.*administrator.*staff.*viewer/is],
  ['member predicate', /private\.is_business_member\(business_id\)/i],
  ['owner and administrator predicate', /private\.has_business_role\([^;]+owner[^;]+administrator/is],
  ['private schema usage', /grant usage on schema private to authenticated/i],
  ['matching approval function', /private\.approval_matches_external_action/i],
  ['one approval per action', /external_action_queue_approval_once_idx/i],
  ['external action constraint', /external_action_requires_approval/i],
  ['approval decisions are final', /approvals_decide_owner_admin_once/i],
  ['browser queue update gate', /external_actions_update_owner_admin_gate/i],
  ['security definer functions revoked from public', /revoke all on function private\.membership_role\(uuid\) from public/i],
  ['explicit proof sequence grant', /grant usage, select on sequence public\.proof_log_id_seq to authenticated/i],
  ['explicit error sequence grant', /grant usage, select on sequence public\.error_log_id_seq to authenticated/i],
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
  ['broad public-schema revoke', /revoke all on all tables in schema public/i],
  ['broad public sequence grant', /grant[^;]+on all sequences in schema public/i],
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
console.log(`Verified ${requiredTables.length} tenant/security tables with RLS and scoped grants.`);
console.log('Verified existing public-schema privileges are not broadly changed.');
console.log('Verified external actions require a unique, matching approval and remain inert.');
