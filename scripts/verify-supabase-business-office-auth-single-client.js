#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const singleton = read('commercial-app/supabase-single-client.js');
const recovery = read('commercial-app/supabase-session-recovery.js');
const index = read('commercial-app/index.html');
const worker = read('commercial-app/service-worker.js');

const checks = [
  ['shared client loads after configuration', index.indexOf('supabase-config.js') < index.indexOf('supabase-single-client.js')],
  ['shared client loads before Supabase Auth', index.indexOf('supabase-single-client.js') < index.indexOf('supabase-auth.js')],
  ['session recovery loads after Auth', index.indexOf('supabase-auth.js') < index.indexOf('supabase-session-recovery.js')],
  ['persistent Office clients are reused', singleton.includes('if (sharedClient)') && singleton.includes('return sharedClient')],
  ['nonpersistent clients are not captured', singleton.includes("auth.persistSession !== false")],
  ['single refresh owner is explicit', singleton.includes("rotatingRefreshOwner: 'single-client'")],
  ['session is validated against Supabase', recovery.includes('auth.getUser(session.access_token)')],
  ['near-expiry session refreshes once', recovery.includes('auth.refreshSession()')],
  ['revoked session clears through Office sign-out', recovery.includes('await officeAuth.signOut()')],
  ['invalid session removes false owner display', recovery.includes("Session expired · secure sign-in required") && recovery.includes('h38:session-invalid')],
  ['draft preservation remains explicit', recovery.includes('draftPreserved: true') && recovery.includes('preservesDrafts: true')],
  ['auth files are network-first', worker.includes("'supabase-single-client.js'") && worker.includes("'supabase-session-recovery.js'")],
  ['new auth files are cached', worker.includes("'./supabase-single-client.js'") && worker.includes("'./supabase-session-recovery.js'")],
  ['no secret or password is stored', !singleton.includes('OPENAI_API_KEY') && !recovery.includes('OPENAI_API_KEY') && !recovery.includes('password:')],
  ['retired Apps Script is not restored', !singleton.includes('script.google.com') && !recovery.includes('script.google.com')]
];

const fakeConfig = {
  enabled: true,
  url: 'https://example.supabase.co',
  publishableKey: 'sb_publishable_abcdefghijklmnopqrstuvwxyz'
};
let nativeCreates = 0;
const sandbox = {
  window: {
    H38_BUSINESS_OFFICE_SUPABASE: fakeConfig,
    supabase: {
      createClient(url, key, options) {
        nativeCreates += 1;
        return { id: nativeCreates, url, key, options };
      }
    }
  }
};
vm.runInNewContext(singleton, sandbox, { filename: 'supabase-single-client.js' });
const persistent = { auth: { persistSession: true, autoRefreshToken: true } };
const first = sandbox.window.supabase.createClient(fakeConfig.url, fakeConfig.publishableKey, persistent);
const second = sandbox.window.supabase.createClient(fakeConfig.url, fakeConfig.publishableKey, persistent);
const isolated = sandbox.window.supabase.createClient(fakeConfig.url, fakeConfig.publishableKey, { auth: { persistSession: false } });
checks.push(['runtime returns one persistent client', first === second]);
checks.push(['runtime creates persistent client only once', sandbox.window.H38_SUPABASE_SHARED_CLIENT.stats().createdCount === 1]);
checks.push(['runtime leaves isolated clients separate', isolated !== first && nativeCreates === 2]);

let failures = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failures += 1;
}
if (failures) {
  console.error(`${failures} single-client Auth checks failed.`);
  process.exit(1);
}
console.log('Single Supabase client and revoked-session recovery checks passed.');