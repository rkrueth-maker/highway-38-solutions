import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const here=path.dirname(fileURLToPath(import.meta.url));
const read=(p)=>fs.readFileSync(path.resolve(here,p),'utf8');

const app=read('src/main/assets/reseller/v200-app.js');
const repair=read('src/main/assets/reseller/v262-phone-video-repair.js');
const edge=read('../../../../supabase/functions/reseller-nearby-stores-v262/index.ts');
const gradle=read('build.gradle');

assert.match(gradle,/versionCode\s+86\b/);
assert.match(gradle,/versionName\s+'2\.6\.2'/);

const v261=app.indexOf("a.src='v261-facebook-public-runtime.js'");
const v262=app.indexOf("r.src='v262-phone-video-repair.js'");
assert.ok(v261>=0,'v261 public authority loader missing');
assert.ok(v262>=0,'v262 phone repair loader missing');
assert.ok(app.includes('a.onload=()=>{authorityLoading=false;loadPhoneRepair()}'),'v261 must load v262 before bootstrap');
assert.ok(app.includes("r.onload=()=>{repairLoading=false;bootstrapV200()}"),'v262 must finish before bootstrap');

assert.match(repair,/H38_SCOUT_V262_PHONE_VIDEO_REPAIR=true/);
assert.match(repair,/reseller-nearby-stores-v262/);
assert.match(repair,/Grand Rapids, MN, 55744/);
assert.match(repair,/data-v262-local-health/);
assert.match(repair,/Search public Facebook/);
assert.match(repair,/no Facebook login/);
assert.doesNotMatch(repair,/Run signed-in Facebook pass/);
assert.doesNotMatch(repair,/openFacebookMarketplace\s*\(/);
assert.ok(repair.includes('return priorRetail(false);'),'successful bootstrap must not be erased by slow durable scan');

assert.match(edge,/central-nearby-bootstrap-v262/);
assert.match(edge,/Promise\.any/);
assert.match(edge,/quickRadiusMiles/);
assert.doesNotMatch(edge,/Grand Rapids/i);
assert.doesNotMatch(edge,/55744/);

console.log('PASS Scout v2.6.2 physical-video repair contract');
