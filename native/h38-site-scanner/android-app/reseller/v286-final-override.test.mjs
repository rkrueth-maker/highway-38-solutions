import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime=fs.readFileSync(new URL('./src/main/assets/reseller/v266-actionable-intake.js',import.meta.url),'utf8');
const prior=fs.readFileSync(new URL('./src/main/assets/reseller/v265-facebook-acquisition-repair.js',import.meta.url),'utf8');
const gradle=fs.readFileSync(new URL('./build.gradle',import.meta.url),'utf8');
function has(src,s,msg){assert.ok(src.includes(s),msg)}

has(runtime,'H38_SCOUT_V286_FINAL_OVERRIDE_REPAIR=true','v286 final override marker missing');
has(runtime,'if(!window.H38_SCOUT_V285_FULL_WEEK_RECOVERY)','v266 must not overwrite v285 automatic Facebook launcher');
has(runtime,"status==='AUTH_REQUIRED'",'auth-required state missing from final renderer');
has(runtime,'data-v286-fb-auth','one-time Facebook auth control missing');
has(runtime,'Facebook Marketplace runs automatically with Discover','automatic Facebook default state missing');
has(runtime,'Acquisition worked; local acceptance is zero','acquisition/location separation missing');
has(runtime,'parser captured 0 Marketplace item cards','parser-zero truth state missing');
has(runtime,'imageCandidates286','shared image candidate pipeline missing');
has(runtime,'H38V286ImageFallback','native image fallback missing');
has(runtime,'data-h38-image-url','remote image fallback binding missing');
has(runtime,"window.huntDisplayImage=function(r){return trustedImageUrl(r)}",'group preview image path still bypasses shared candidate pipeline');
has(runtime,'product_image_url','product image field missing');
has(runtime,'listing_image_url','listing image field missing');
has(runtime,'source_image_url','source image field missing');
has(runtime,'data-open','exact source action was not restored');
has(prior,"Promise.allSettled([fn('reseller-auto-leads-v064'",'Penny provider isolation missing');
has(prior,"fn('reseller-auto-leads-v058'",'Penny fallback provider missing');
has(prior,"h.textContent='Penny Hunt'",'Penny Hunt identity repair missing');
assert.match(gradle,/versionCode 102/);
assert.match(gradle,/versionName '2\.8\.6'/);
console.log('PASS v2.8.6 final override / Facebook / image / Penny contracts');
