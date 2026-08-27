import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname));
const runtime=fs.readFileSync(path.join(root,'src/main/assets/reseller/v261-facebook-public-runtime.js'),'utf8');
const app=fs.readFileSync(path.join(root,'src/main/assets/reseller/v200-app.js'),'utf8');
const gradle=fs.readFileSync(path.join(root,'build.gradle'),'utf8');
const backend=fs.readFileSync(path.resolve(root,'../../../../supabase/functions/reseller-facebook-public-v240/index.ts'),'utf8');
const core=fs.readFileSync(path.resolve(root,'../../../../supabase/functions/reseller-facebook-public-v240/core.mjs'),'utf8');

assert.match(runtime,/H38_SCOUT_V261_FACEBOOK_RENDER_AUTHORITY=true/);
assert.match(runtime,/Search public Facebook/);
assert.match(runtime,/await ensurePublicFacebookArea\(\)/);
assert.match(runtime,/reseller-location-geocode/);
assert.match(runtime,/NO_FACEBOOK_LOGIN/);
assert.match(runtime,/device_fallback_required:false/);
assert.match(runtime,/openFacebookScan=function\(\)\{void runFacebookPublicV261\(true\)\}/);
assert.match(runtime,/browser:\[\],notifications:\[\]/);
assert.match(runtime,/alerts\.remove\(\)/);
assert.match(runtime,/data-v261-facebook-status/);
assert.doesNotMatch(runtime,/openFacebookMarketplace\(/);

assert.match(app,/v261-facebook-public-runtime\.js/);
assert.match(app,/s\.onload=loadPublicAuthority/);
assert.match(app,/a\.onload=\(\)=>\{authorityLoading=false;bootstrapV200\(\)\}/);
assert.match(gradle,/versionCode 85/);
assert.match(gradle,/versionName '2\.6\.1'/);

assert.match(backend,/authentication:'NO_FACEBOOK_LOGIN'/);
assert.match(backend,/device_fallback_required:false/);
assert.doesNotMatch(backend,/Grand Rapids/);
assert.doesNotMatch(backend,/55744/);
assert.doesNotMatch(core,/Grand Rapids/);
assert.doesNotMatch(core,/55744/);
assert.match(core,/onlyVerified===true/);

console.log('PASS Scout v2.6.1 rendered public Facebook authority contract');
