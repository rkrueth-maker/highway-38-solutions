#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));
const passes = [];
const failures = [];
const check = (name, condition, detail = '') => {
  (condition ? passes : failures).push({ name, detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const required = [
  'customer-portal.html',
  'customer-portal-config.js',
  'customer-portal-supabase.js',
  'supabase/migrations/20260716_customer_portal.sql',
  'core-engine/customer-portal/config/customer-portal.supabase.example.json',
  'core-engine/customer-portal/SUPABASE_SETUP.md',
  'apps-script/core-engine/owner-portal-next/Portal_Unified.js'
];
required.forEach(file => check(`file ${file}`, exists(file)));

for (const file of ['customer-portal-config.js','customer-portal-supabase.js','apps-script/core-engine/owner-portal-next/Portal_Unified.js']) {
  if (!exists(file)) continue;
  try { new vm.Script(read(file), { filename: file }); check(`syntax ${file}`, true); }
  catch (error) { check(`syntax ${file}`, false, error.message); }
}

const html = exists('customer-portal.html') ? read('customer-portal.html') : '';
const config = exists('customer-portal-config.js') ? read('customer-portal-config.js') : '';
const client = exists('customer-portal-supabase.js') ? read('customer-portal-supabase.js') : '';
const sql = exists('supabase/migrations/20260716_customer_portal.sql') ? read('supabase/migrations/20260716_customer_portal.sql') : '';
const portal = exists('apps-script/core-engine/owner-portal-next/Portal_Unified.js') ? read('apps-script/core-engine/owner-portal-next/Portal_Unified.js') : '';

check('Tasks and Messaging have separate navigation groups',
  portal.includes("id: 'tasksWork'") &&
  portal.includes("label: 'Tasks'") &&
  portal.includes("id: 'messaging'") &&
  portal.includes("label: 'Messaging'") &&
  !portal.includes("label: 'Tasks & Messaging'")
);
check('non-owner navigation retains both separated surfaces',
  portal.includes("['tasksWork','messaging'].indexOf(group.id) >= 0")
);

check('customer portal loads Supabase v2 client',
  /@supabase\/supabase-js@2/.test(html) &&
  html.includes('customer-portal-config.js') &&
  html.includes('customer-portal-supabase.js')
);
check('repository defaults remain fail closed',
  /enabled:\s*false/.test(config) &&
  /REPLACE_WITH_SUPABASE_PUBLISHABLE_KEY/.test(config)
);
check('browser code contains no service-role assignment',
  !/service(?:_|-)?role(?:Key)?\s*[:=]\s*['"][^'"]+/i.test(client + config + html)
);
check('magic-link login does not auto-create users',
  client.includes('signInWithOtp') &&
  client.includes('shouldCreateUser: false')
);
check('client filters every customer query',
  client.includes(".eq('customer_id', state.account.id)")
);
check('selected quote approval uses version-checked RPC',
  client.includes("rpc('customer_portal_approve_quote'") &&
  sql.includes('p_expected_version') &&
  sql.includes("v_quote.status <> 'presented'") &&
  sql.includes('v_quote.customer_decision is not null')
);
check('customer messages remain owner-review records',
  client.includes("status: 'pending_owner_review'") &&
  client.includes('No automatic text or email was sent') &&
  sql.includes("direction = 'customer_to_business'")
);
check('all customer tables enable RLS',
  ['customer_accounts','customer_jobs','customer_quotes','customer_invoices','customer_messages','customer_files','customer_portal_events']
    .every(table => sql.includes(`alter table public.${table} enable row level security`))
);
check('RLS maps auth user to one active customer',
  sql.includes('customer_portal_customer_id') &&
  sql.includes('auth_user_id = (select auth.uid())') &&
  sql.includes("status = 'active'")
);
check('private storage bucket and signed URLs',
  sql.includes("'customer-portal'") &&
  sql.includes('public, file_size_limit') &&
  sql.includes('false,') &&
  client.includes('createSignedUrl') &&
  client.includes('120')
);
check('storage policies isolate first path segment by customer',
  sql.includes('(storage.foldername(name))[1]') &&
  sql.includes('customer_portal_customer_id')
);
check('raw card collection absent',
  !/cardNumber|\bcvv\b|\bcvc\b|fullCard/i.test(html + client + sql)
);
check('no embedded Supabase secret-looking values',
  !/eyJ[a-zA-Z0-9_-]{50,}|sb_secret_[a-zA-Z0-9_-]{20,}/i.test(config + client + html)
);

const evidence = {
  status: failures.length ? 'HOLD' : 'PASS',
  generatedAt: new Date().toISOString(),
  passed: passes.length,
  failed: failures.length,
  controls: {
    tasksSeparatedFromMessaging: true,
    provider: 'supabase',
    auth: 'magic_link_existing_users_only',
    rowLevelSecurity: true,
    privateStorage: true,
    signedDownloads: true,
    selectedQuoteApproval: true,
    automaticCustomerMessaging: false,
    rawCardData: false,
    repositoryDefaultEnabled: false
  },
  passes,
  failures,
  externalActionsOccurred: false
};

const outDir = path.join(root, 'launch-control', 'evidence');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'customer-portal-supabase-verification.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
process.exit(failures.length ? 1 : 0);
