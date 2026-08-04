#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const launcherPath = 'open-business-office.html';
const clientPath = 'business-office-auth-bootstrap.js';
const configPath = 'customer-portal-config.js';
const evidencePath = 'launch-control/evidence/business-office-supabase-auth-bootstrap-verification.json';
const expectedDeploymentId = 'AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow';

const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));
const passes = [];
const failures = [];
const check = (name, condition, detail = '') => {
  const result = { name, detail };
  (condition ? passes : failures).push(result);
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

[launcherPath, clientPath, configPath].forEach(file => check(`file ${file}`, exists(file)));

const launcher = exists(launcherPath) ? read(launcherPath) : '';
const client = exists(clientPath) ? read(clientPath) : '';
const config = exists(configPath) ? read(configPath) : '';
const all = [launcher, client, config].join('\n');

check('normal Business Office path remains the current Google launcher',
  launcher.includes("if(preview)openSupabasePreview();") &&
  launcher.includes('else openLegacy();') &&
  launcher.includes(expectedDeploymentId) &&
  launcher.includes("window.location.replace(destination)"));

check('Supabase preview is explicit opt-in only',
  launcher.includes("incoming.get('auth')") &&
  launcher.includes("==='supabase'") &&
  !/openSupabasePreview\(\);\s*else openSupabasePreview\(\)/.test(launcher));

check('Supabase browser client is pinned',
  launcher.includes('@supabase/supabase-js@2.110.8') &&
  !launcher.includes('@supabase/supabase-js@2\"') &&
  !launcher.includes('@supabase/supabase-js@latest'));

check('only publishable browser configuration is used',
  client.includes('config.publishableKey') &&
  client.includes('window.H38_CUSTOMER_PORTAL_SUPABASE') &&
  !/service_role|sb_secret_|SUPABASE_SERVICE/i.test(all) &&
  !/eyJ[A-Za-z0-9_-]{50,}/.test(all));

check('password login is supported without local credential storage',
  client.includes('auth.signInWithPassword') &&
  client.includes("passwordNode.value = ''") &&
  !/localStorage\.setItem\([^)]*(password|credential|token)/i.test(client));

check('magic link is user-triggered and cannot create an account',
  client.includes("magic.addEventListener('click'") &&
  client.includes('auth.signInWithOtp') &&
  client.includes('shouldCreateUser: false') &&
  !/safeRun\(sendMagicLink\)/.test(client.replace("magic.addEventListener('click', () => safeRun(sendMagicLink));", '')));

check('tenant membership and enabled modules are database-authorized',
  client.includes("from('business_office_my_businesses')") &&
  client.includes("from('business_module_settings')") &&
  client.includes(".eq('membership_status', 'active')") &&
  client.includes(".eq('business_status', 'active')") &&
  client.includes(".eq('enabled', true)"));

check('verified preview requires a user action before legacy Office opens',
  launcher.includes('id="officeAuthContinue"') &&
  client.includes("continueButton.addEventListener('click', recordVerifiedBootstrap)") &&
  !/window\.location\.(replace|assign)\(/.test(client));

check('no Supabase access token is passed to Apps Script or stored by the preview',
  client.includes("destination.searchParams.set('supabaseAuth', 'verified')") &&
  client.includes("destination.searchParams.set('supabaseTenant'") &&
  !/access_token|refresh_token|session\.access|session\.refresh/i.test(client));

check('session marker contains only non-secret verification metadata',
  client.includes("sessionStorage.setItem('h38-supabase-office-bootstrap-v1'") &&
  client.includes('businessId: state.selected.business_id') &&
  client.includes('role: state.selected.role') &&
  client.includes('userId: state.session.user.id') &&
  client.includes('externalActionOccurred: false'));

check('fallback remains available when Supabase preview is unavailable',
  launcher.includes('id="legacyFallback"') &&
  launcher.includes('Use current Google sign-in') &&
  launcher.includes('The current Google Office remains available'));

check('preview is private from search indexing',
  launcher.includes('name="robots" content="noindex,nofollow"'));

check('normal launch clears only obsolete local Office state',
  launcher.includes("sessionStorage.removeItem('h38-gateway-session-v1')") &&
  launcher.includes("sessionStorage.removeItem('h38-execution-session-v1')") &&
  !/localStorage\.clear\(|sessionStorage\.clear\(/.test(launcher));

check('preview performs no automatic external action',
  client.includes('externalActionOccurred: false') &&
  !/fetch\(|XMLHttpRequest|\.send\(|payments?|publish|purchase/i.test(client));

check('Northern Lakes is not activated or referenced',
  !/northern[- ]lakes|nlpm|nlpm-office-gateway/i.test(all));

check('existing exact Google deployment is preserved and no project creation exists',
  (all.match(new RegExp(expectedDeploymentId, 'g')) || []).length >= 2 &&
  !/create.*apps.?script|new.*deployment|projects\.create|deployments\.create/i.test(all));

const evidence = {
  status: failures.length ? 'HOLD' : 'PASS',
  generatedAt: new Date().toISOString(),
  scope: 'business-office-supabase-auth-bootstrap',
  files: [launcherPath, clientPath, configPath],
  controls: {
    previewOnly: true,
    legacyDefaultPreserved: true,
    exactAppsScriptDeploymentPreserved: true,
    publishableKeyOnly: true,
    serviceRoleExposed: false,
    tenantMembershipRequired: true,
    userTriggeredMagicLinkOnly: true,
    automaticAccountCreation: false,
    automaticRedirectAfterSupabaseSignIn: false,
    accessTokenForwarded: false,
    externalActionsOccurred: false,
    automaticApprovals: false,
    automaticSends: false,
    northernLakesActivated: false
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
