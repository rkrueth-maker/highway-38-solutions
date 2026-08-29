import fs from 'node:fs';
import assert from 'node:assert/strict';

const p='src/main/assets/reseller/';
const v264=fs.readFileSync(p+'v264-wide-repair.js','utf8');
const v265=fs.readFileSync(p+'v265-facebook-acquisition-repair.js','utf8');
const v300=fs.readFileSync(p+'v266-actionable-intake.js','utf8');
const gradle=fs.readFileSync('build.gradle','utf8');
const rules=fs.readFileSync('V3-RUNTIME-RULES.md','utf8');

assert.match(v264,/H38_SCOUT_LEGACY_V264_DISABLED=true/);
assert.match(v265,/H38_SCOUT_LEGACY_V265_DISABLED=true/);
assert.doesNotMatch(v264,/renderDiscover\s*=|loadHunt\s*=|facebookSnapshot\s*=/);
assert.doesNotMatch(v265,/renderDiscover\s*=|loadHunt\s*=|facebookSnapshot\s*=/);

assert.match(v300,/H38_SCOUT_V300_SINGLE_OWNER_RUNTIME=true/);
assert.match(v300,/facebookSnapshot=function/);
assert.match(v300,/captured:fb\.captured/);
assert.match(v300,/LOCATION NEEDS PROOF/);
assert.match(v300,/COMPLETE_EMPTY/);
assert.match(v300,/FB_TIMEOUT_MS=45000/);
assert.match(v300,/H38V300StartFacebook/);
assert.match(v300,/H38FacebookConnected/);
assert.match(v300,/setTimeout\(\(\)=>startFacebook\(true\),350\)/);
assert.match(v300,/H38V300ImageFallback/);
assert.match(v300,/fetchImageData/);
assert.match(v300,/Promise\.allSettled\(\[fn\('reseller-auto-leads-v064'/);
assert.match(v300,/fn\('reseller-auto-leads-v058'/);
assert.match(v300,/Penny Hunt/);
assert.match(v300,/physical UPC\/register scan remains final local penny truth/i);

assert.match(gradle,/versionCode 300/);
assert.match(gradle,/versionName '3\.0\.0'/);
assert.match(rules,/Single-owner runtime rule/);
assert.match(rules,/Physical Android phone behavior remains final acceptance/);

console.log('PASS v3.0.0 single-owner runtime architecture contracts');
