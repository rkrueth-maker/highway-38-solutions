import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname));
const app=fs.readFileSync(path.join(root,'src/main/assets/reseller/v260-facebook-public.js'),'utf8');
const backend=fs.readFileSync(path.resolve(root,'../../../../supabase/functions/reseller-facebook-public-v240/index.ts'),'utf8');
const core=fs.readFileSync(path.resolve(root,'../../../../supabase/functions/reseller-facebook-public-v240/core.mjs'),'utf8');

assert.match(app,/H38_SCOUT_V260_FACEBOOK_PUBLIC_FIRST=true/);
assert.match(app,/openFacebookScan=function\(\)\{void runFacebookPublicV260\(true\)\}/);
assert.match(app,/browser:\[\],notifications:\[\]/);
assert.match(app,/Search public Facebook/);
assert.match(app,/Facebook login, cookies and notification access are not used/);
assert.doesNotMatch(app,/openFacebookMarketplace\(/);

assert.match(backend,/H38_FACEBOOK_PUBLIC_V260/);
assert.match(backend,/authentication:'NO_FACEBOOK_LOGIN'/);
assert.match(backend,/device_fallback_required:false/);
assert.match(backend,/site:facebook\.com\/marketplace\/item/);
assert.match(backend,/Public-only Facebook discovery/);
assert.doesNotMatch(backend,/Grand Rapids/);
assert.doesNotMatch(backend,/55744/);
assert.doesNotMatch(core,/Grand Rapids/);
assert.doesNotMatch(core,/55744/);
assert.match(core,/location_evidence:evidence/);
assert.match(core,/onlyVerified===true/);

console.log('PASS Scout v2.6.0 public-only Facebook acquisition contract');
