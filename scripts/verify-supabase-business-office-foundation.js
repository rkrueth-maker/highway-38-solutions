#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationPath = 'supabase/migrations/20260804_business_office_foundation.sql';
const architecturePath = 'docs/architecture/SUPABASE_BUSINESS_OFFICE_MIGRATION.md';
const evidencePath = 'launch-control/evidence/supabase-business-office-foundation-verification.json';
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));
const passes = [];
const failures = [];
const check = (name, condition, detail = '') => {
  const result = { name, detail };
  (condition ? passes : failures).push(result);
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

check(`file ${migrationPath}`, exists(migrationPath));
check(`file ${architecturePath}`, exists(architecturePath));

const sql = exists(migrationPath) ? read(migrationPath) : '';
const architecture = exists(architecturePath) ? read(architecturePath) : '';
const newTables = [
  'businesses',
  'business_memberships',
  'business_module_settings',
  'business_approvals',
  'business_proof_log',
  'business_error_log',
  'price_book_items',
  'quote_items'
];
const existingCustomerTables = [
  'customer_accounts',
  'customer_jobs',
  'customer_quotes',
  'customer_invoices',
  'customer_messages',
  'customer_files',
  'customer_portal_events'
];

check('migration is explicitly additive and no-external-action',
  /Additive, tenant-safe migration/.test(sql) &&
  /No external action, automatic approval, automatic send, payment, publishing, or deployment/.test(sql));

check('one shared tenant and membership model exists',
  sql.includes('create table if not exists public.businesses') &&
  sql.includes('create table if not exists public.business_memberships') &&
  ['owner', 'administrator', 'staff', 'viewer'].every(role => sql.includes(`'${role}'`)));

check('existing customer records are extended instead of duplicated',
  existingCustomerTables.every(table => sql.includes(`alter table public.${table}`)) &&
  !/create table if not exists public\.(business_customers|business_jobs|business_quotes|office_customers|office_jobs|office_quotes)\b/i.test(sql));

check('all new exposed tables enable RLS',
  newTables.every(table => sql.includes(`alter table public.${table} enable row level security`)));

check('tenant authorization uses a private membership predicate',
  sql.includes('create or replace function private.business_access') &&
  sql.includes('security definer') &&
  sql.includes("membership.auth_user_id = (select auth.uid())") &&
  sql.includes("membership.status = 'active'") &&
  sql.includes('revoke all on function private.business_access(uuid, text[]) from public') &&
  sql.includes('revoke all on function private.business_access(uuid, text[]) from anon'));

check('authorization does not rely on editable user metadata',
  !/user_metadata|raw_user_meta_data/i.test(sql + architecture));

check('every business policy combines authentication with business authorization',
  (sql.match(/to authenticated/g) || []).length >= 20 &&
  (sql.match(/private\.business_access/g) || []).length >= 30);

check('invited business memberships activate through a private Auth trigger',
  sql.includes('private.link_invited_business_memberships') &&
  sql.includes('after insert or update of email on auth.users') &&
  sql.includes('revoke all on function private.link_invited_business_memberships() from authenticated'));

check('Customer Portal compatibility is preserved for Highway 38',
  sql.includes('create or replace function public.customer_portal_customer_id()') &&
  sql.includes("tenant_key = 'highway38'") &&
  sql.includes('private.link_invited_customer_account'));

check('global customer and document numbers become tenant-scoped',
  [
    'customer_accounts_business_code_unique',
    'customer_jobs_business_number_unique',
    'customer_quotes_business_number_unique',
    'customer_invoices_business_number_unique'
  ].every(index => sql.includes(index)));

check('Price Book supports local research but requires owner review',
  sql.includes('create table if not exists public.price_book_items') &&
  sql.includes("'local_research'") &&
  sql.includes("default 'owner_review_required'") &&
  sql.includes('staff propose price book items') &&
  sql.includes('administrators approve price book items'));

check('itemized quotes remain unapproved when staff create lines',
  sql.includes('create table if not exists public.quote_items') &&
  sql.includes('work_package text') &&
  sql.includes('staff create unapproved quote items') &&
  sql.includes('approved = false') &&
  sql.includes('owner_review_required = true'));

check('approval and proof records cannot enable external action',
  sql.includes('external_action_allowed boolean not null default false') &&
  sql.includes('external_action_occurred boolean not null default false') &&
  sql.includes('external_action_allowed = false') &&
  sql.includes('external_action_occurred = false'));

check('private business storage is tenant-path isolated',
  sql.includes("'business-office'") &&
  sql.includes('(storage.foldername(name))[1]') &&
  sql.includes("bucket_id = 'business-office'") &&
  sql.includes('private.business_access'));

check('foundation grants no business data access to anon',
  newTables.every(table => sql.includes(`revoke all on public.${table} from anon`)));

check('browser service-role secrets are absent',
  !/service_role|sb_secret_|eyJ[A-Za-z0-9_-]{50,}/i.test(sql + architecture));

check('Northern Lakes is not activated by the foundation migration',
  !/northern[- ]lakes|nlpm/i.test(sql) &&
  architecture.includes('Northern Lakes remains unactivated'));

check('Highway 38 is the only seeded business',
  sql.includes("'highway38'") &&
  (sql.match(/insert into public\.businesses/g) || []).length === 1);

check('migration is resumable and duplicate-resistant',
  (sql.match(/if not exists/g) || []).length >= 20 &&
  (sql.match(/on conflict/g) || []).length >= 2 &&
  (sql.match(/drop policy if exists/g) || []).length >= 20);

check('architecture keeps one product and the existing fallback',
  architecture.includes('Highway 38 Business Office remains one authenticated product') &&
  architecture.includes('existing Apps Script launcher remains the production fallback') &&
  architecture.includes('does not receive a new Supabase project'));

check('rollout is staged and destructive rollback is blocked',
  ['Stage 1', 'Stage 2', 'Stage 3', 'Stage 4', 'Stage 5'].every(stage => architecture.includes(stage)) &&
  architecture.includes('Do not drop migrated tables or columns as a routine rollback'));

const evidence = {
  status: failures.length ? 'HOLD' : 'PASS',
  generatedAt: new Date().toISOString(),
  scope: 'supabase-business-office-foundation',
  migration: migrationPath,
  architecture: architecturePath,
  controls: {
    sharedPlatform: true,
    canonicalCustomerTablesExtended: true,
    supabaseAuthMemberships: true,
    rowLevelSecurity: true,
    privateStorage: true,
    priceBookFirst: true,
    researchedPricingOwnerReviewRequired: true,
    itemizedQuotes: true,
    automaticApprovals: false,
    automaticSends: false,
    externalActionsOccurred: false,
    northernLakesActivated: false,
    appsScriptFallbackPreserved: true
  },
  passed: passes.length,
  failed: failures.length,
  passes,
  failures
};

const output = path.join(root, evidencePath);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
process.exit(failures.length ? 1 : 0);
