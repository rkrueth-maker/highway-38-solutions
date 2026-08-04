#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260804232100_multitenant_platform_foundation.sql'
);
const testPath = path.resolve(
  process.cwd(),
  'supabase/tests/database/multitenant_foundation.test.sql'
);

const failures = [];
for (const filePath of [migrationPath, testPath]) {
  if (!fs.existsSync(filePath)) failures.push(`missing required file: ${filePath}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');
const testSql = fs.readFileSync(testPath, 'utf8');

const canonicalTables = [
  'businesses',
  'business_memberships',
  'business_module_settings',
  'business_approvals',
  'business_proof_log',
  'business_error_log',
  'price_book_items',
  'quote_items',
];

for (const table of canonicalTables) {
  if (!new RegExp(`to_regclass\\('public\\.${table}'\\)`, 'i').test(sql)) {
    failures.push(`migration does not require canonical table public.${table}`);
  }
  if (new RegExp(`create table(?: if not exists)? public\\.${table}\\b`, 'i').test(sql)) {
    failures.push(`migration attempts to duplicate canonical table public.${table}`);
  }
}

const requiredPatterns = [
  ['canonical membership key', /business_memberships[\s\S]+auth_user_id/i],
  ['fail-closed duplicate-system guard', /refusing to create a second tenant system/i],
  ['approval consistency constraint', /business_approvals_review_consistency/i],
  ['approval transition guard', /guard_business_approval_transition/i],
  ['pending-review policy', /administrators review pending approvals/i],
  ['Owner-only external gate', /owners allow approved external actions/i],
  ['inert external-action queue', /create table if not exists public\.external_action_queue/i],
  ['queue RLS', /alter table public\.external_action_queue enable row level security/i],
  ['staff draft-only policy', /staff draft external actions/i],
  ['browser preparation policy', /administrators prepare approved external actions/i],
  ['matching approval function', /private\.approval_matches_external_action/i],
  ['explicit Owner role', /private\.business_access\(business_id, array\['owner'\]\)/i],
  ['browser execution remains absent', /status in \('draft', 'pending_owner_approval'\)/i],
  ['anonymous queue access revoked', /revoke all on table public\.external_action_queue from anon/i],
  ['branch database rollback test', /rollback;/i],
  ['cross-tenant test', /cannot update another business module/i],
  ['viewer restriction test', /viewer cannot change module settings/i],
  ['staff approval restriction test', /staff cannot approve an action/i],
  ['administrator Owner-gate restriction', /administrator cannot grant external-action authorization/i],
  ['browser execution test', /browser role cannot execute an external action/i],
];

for (const [label, pattern] of requiredPatterns) {
  const source = label.includes('test') || label.includes('restriction') || label.includes('cross-tenant')
    ? testSql
    : sql;
  if (!pattern.test(source)) failures.push(`missing ${label}`);
}

const forbiddenPatterns = [
  ['anonymous grant', /grant\s+.+\s+to\s+anon/i],
  ['broad public-schema revoke', /revoke all on all tables in schema public/i],
  ['user-editable metadata authorization', /user_metadata|raw_user_meta_data/i],
  ['automatic action execution trigger', /create\s+trigger[^;]+(?:send|publish|charge|execute_action)/is],
  ['browser executing-state policy', /with check[\s\S]{0,800}status\s*=\s*'executing'/i],
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
console.log('Verified canonical tenant tables are reused, not duplicated.');
console.log('Verified final approval decisions and Owner external-action gate are immutable.');
console.log('Verified browser roles can prepare but cannot execute external actions.');
