import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here=path.dirname(fileURLToPath(import.meta.url));
const p=path.join(here,'src/main/assets/reseller');
const v264=fs.readFileSync(path.join(p,'v264-wide-repair.js'),'utf8');
const v265=fs.readFileSync(path.join(p,'v265-facebook-acquisition-repair.js'),'utf8');
const v300=fs.readFileSync(path.join(p,'v266-actionable-intake.js'),'utf8');
const gradle=fs.readFileSync(path.join(here,'build.gradle'),'utf8');
const rules=fs.readFileSync(path.join(here,'V3-RUNTIME-RULES.md'),'utf8');

assert.match(v264,/H38_SCOUT_LEGACY_V264_DISABLED=true/);
assert.match(v265,/H38_SCOUT_LEGACY_V265_DISABLED=true/);
assert.doesNotMatch(v264,/renderDiscover\s*=|loadHunt\s*=|facebookSnapshot\s*=/);
assert.doesNotMatch(v265,/renderDiscover\s*=|loadHunt\s*=|facebookSnapshot\s*=/);

assert.match(v300,/H38_SCOUT_V300_SINGLE_OWNER_RUNTIME=true/);
assert.match(v300,/H38_SCOUT_V301_PHYSICAL_RECOVERY=true/);
assert.match(v300,/facebookSnapshot=function/);
assert.match(v300,/captured:fb\.captured/);
assert.match(v300,/LOCATION NEEDS PROOF/);
assert.match(v300,/COMPLETE_EMPTY/);
assert.match(v300,/Repair Facebook session/);
assert.match(v300,/FB_TIMEOUT_MS=45000/);
assert.match(v300,/H38V300StartFacebook/);
assert.match(v300,/H38FacebookConnected/);
assert.match(v300,/setTimeout\(\(\)=>startFacebook\(true\),350\)/);
assert.match(v300,/H38V300ImageFallback/);
assert.match(v300,/imageCandidateMap/);
assert.match(v300,/beginNativeImage/);
assert.match(v300,/fetchImageData/);
assert.match(v300,/Promise\.allSettled\(\[fn\('reseller-auto-leads-v064'/);
assert.match(v300,/fn\('reseller-auto-leads-v058'/);
assert.match(v300,/Penny Hunt/);
assert.match(v300,/physical UPC\/register scan remains final local penny truth/i);

assert.match(gradle,/versionCode 301/);
assert.match(gradle,/versionName '3\.0\.1'/);
assert.match(rules,/Single-owner runtime rule/);
assert.match(rules,/Physical Android phone behavior remains final acceptance/);

console.log('PASS v3.0.1 physical recovery single-owner runtime contracts');
