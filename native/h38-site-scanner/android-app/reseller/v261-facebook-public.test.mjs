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

// v261 public authority must always load after the v240 provider layer.
assert.match(app,/v261-facebook-public-runtime\.js/);
assert.match(app,/s\.onload=loadPublicAuthority/);

// v2.6.1 booted directly after v261. Newer repairs may insert another authority
// layer, but v261 must still complete before that layer and bootstrap must remain
// downstream of it. This keeps the public-Facebook ordering contract strict.
const directBootstrap=/a\.onload=\(\)=>\{authorityLoading=false;bootstrapV200\(\)\}/.test(app);
const repairBootstrap=/a\.onload=\(\)=>\{authorityLoading=false;loadPhoneRepair\(\)\}/.test(app)
  && /r\.src='v262-phone-video-repair\.js'/.test(app)
  && /r\.onload=\(\)=>\{repairLoading=false;bootstrapV200\(\)\}/.test(app);
assert.ok(directBootstrap||repairBootstrap,'v261 public authority must complete before Scout bootstrap');

const versionCode=Number((gradle.match(/versionCode\s+(\d+)/)||[])[1]);
const versionName=(gradle.match(/versionName\s+'([^']+)'/)||[])[1]||'';
assert.ok(versionCode>=85,'Scout build must not regress below v2.6.1 versionCode 85');
assert.match(versionName,/^2\.6\.[1-9]\d*$/,'Scout build must remain v2.6.1 or newer');

assert.match(backend,/authentication:'NO_FACEBOOK_LOGIN'/);
assert.match(backend,/device_fallback_required:false/);
assert.doesNotMatch(backend,/Grand Rapids/);
assert.doesNotMatch(backend,/55744/);
assert.doesNotMatch(core,/Grand Rapids/);
assert.doesNotMatch(core,/55744/);
assert.match(core,/onlyVerified===true/);

console.log('PASS Scout v2.6.1+ rendered public Facebook authority contract');
