import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime=fs.readFileSync(new URL('./src/main/assets/reseller/v265-facebook-acquisition-repair.js',import.meta.url),'utf8');
const gradle=fs.readFileSync(new URL('./build.gradle',import.meta.url),'utf8');

function has(s,msg){assert.ok(runtime.includes(s),msg)}
function lacks(s,msg){assert.ok(!runtime.includes(s),msg)}

has('H38_SCOUT_V285_FULL_WEEK_RECOVERY=true','v285 marker missing');
has("Promise.allSettled([fn('reseller-auto-leads-v064'",'Penny provider isolation missing');
has("fn('reseller-auto-leads-v058'",'independent Penny fallback provider missing');
has("const HUNT_CACHE='h38.scout.v285.hunt-evidence'",'Penny evidence cache missing');
has("if(!rows.length){const fallback=prior.length?prior:cachedHunt()",'empty provider pass must not erase prior evidence');
has("h.textContent='Penny Hunt'",'Penny Hunt identity not restored');
has('physical UPC/register scan remains final local penny truth.','Penny truth contract missing');
has("if(fb.status==='AUTH_REQUIRED')",'Facebook auth must be collector-driven');
has("data-v285-fb-auth",'one-time auth action missing');
has("window.H38FacebookConnected=function()",'Facebook auth return callback missing');
has("setTimeout(startFacebookAutomatic,350)",'Facebook must auto-rerun after auth');
has("window.H38V270OpenFacebookScan=startFacebookAutomatic",'normal Facebook acquisition must stay automatic');
has("Facebook Marketplace runs automatically with Discover",'normal automatic Facebook UX missing');
has("Facebook loaded but the parser captured 0 Marketplace item cards",'parser-zero truth state missing');
has("Acquisition succeeded; local acceptance is zero",'acquisition/location separation missing');
has("FB_TERMINAL=new Set(['AUTH_REQUIRED','COMPLETE_WITH_ROWS','COMPLETE_LOCATION_UNPROVEN','COMPLETE_EMPTY','CHECKPOINT','ERROR'])",'Facebook terminal state model incomplete');
has('listing_image_url','Facebook/listing image candidates missing');
has('product_image_url','retailer image candidates missing');
has('(logo|favicon|sprite|pixel|tracking|placeholder|blank|spacer|avatar|badge|banner|promo)','placeholder/logo rejection missing');
has("if(u)return`<img class=\"thumb\"",'shared image renderer missing');
lacks("buy_price:0",'runtime must not manufacture unknown price as zero');
lacks("penny_date:new Date",'runtime must not manufacture penny dates');
assert.match(gradle,/versionCode 101/);
assert.match(gradle,/versionName '2\.8\.5'/);

console.log('PASS v2.8.5 full-week recovery contracts');
