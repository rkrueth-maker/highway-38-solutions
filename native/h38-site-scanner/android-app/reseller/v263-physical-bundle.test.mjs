import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname));
const app=fs.readFileSync(path.join(root,'src/main/assets/reseller/v200-app.js'),'utf8');
const main=fs.readFileSync(path.join(root,'src/main/java/com/highway38/resellerscout/MainActivity.java'),'utf8');
const gradle=fs.readFileSync(path.join(root,'build.gradle'),'utf8');

assert.match(app,/H38_SCOUT_V263_PHYSICAL_BUNDLE_AUTHORITY=true/);
assert.match(app,/H38_SCOUT_V261_FACEBOOK_PUBLIC_INSTALLED=true/);
assert.match(app,/H38_SCOUT_V262_PHONE_VIDEO_REPAIR_INSTALLED=true/);
assert.match(app,/Search public Facebook/);
assert.match(app,/Public-only Marketplace discovery/);
assert.match(app,/reseller-nearby-stores-v262/);
assert.match(app,/Grand Rapids, MN, 55744/);
assert.match(app,/data-v263-local-health/);
assert.match(app,/H38InstallV263PhysicalBundleAuthority\(\);\s*if\(window\.H38_SCOUT_V261_FACEBOOK_PUBLIC_INSTALLED===true\)/);
assert.match(app,/H38InstallV263PhysicalBundleAuthority\(\);\s*if\(window\.H38_SCOUT_V262_PHONE_VIDEO_REPAIR_INSTALLED===true\)/);
assert.doesNotMatch(app,/Run signed-in Facebook pass/);

assert.match(main,/"v200-app\.js"/);
assert.match(main,/data-h38-bundled-module=\\"v240-data\.js\\"/);
assert.match(main,/providerLayer \+ appMarker/);

assert.match(gradle,/versionCode 87/);
assert.match(gradle,/versionName '2\.6\.3'/);
console.log('PASS Scout v2.6.3 physical Android bundle authority contract');
