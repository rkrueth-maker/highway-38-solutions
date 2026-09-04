import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('reseller/src/main/assets/reseller/v240-data.js','utf8');
assert.match(source,/H38_SCOUT_V328_SOURCE_QUALITY=true/);
assert.doesNotMatch(source,/H38_SCOUT_V327_CLEAN_SOURCING=true/);
assert.match(source,/label:'CHECK STORE'/);
assert.match(source,/function confirmedPenny/);
assert.match(source,/function pennyLocalProof/);
assert.match(source,/function localActionable/);
assert.match(source,/first seen at \(\?:a \)\?penny/i);

const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const txt=v=>String(v??'').trim();
const badTitle=v=>{const s=txt(v).replace(/\s+/g,' ').trim(),n=norm(s);return !s||s.length<4||/^(?:dollar general(?: inventory checker)?|inventory checker|search|clearance|penny|item|product|unknown|n\/a)$/i.test(s)||/^(?:1\s*(?:¢|cent|cents?)|one cent)$/i.test(s)||/^first seen at (?:a )?penny(?:\b|\s*[·|–—:-])/i.test(s)||/^penny date unknown$/i.test(s)||/^(?:today|yesterday|\d+\s+(?:minutes?|hours?|days?|weeks?)\s+ago)$/i.test(s)||/href\s*=|<\/?[a-z][^>]*>|(?:search|clearance|penny)\s*[|–—:-]\s*dollar general/i.test(s)||/^(?:first seen|seen)\s+at\s+(?:a\s+)?penny/.test(n)};
const absolute=v=>{const s=txt(v);if(!s||/^(?:today|yesterday|\d+\s+(?:minutes?|hours?|days?|weeks?)\s+ago)$/i.test(s))return false;return Number.isFinite(Date.parse(s))};
const rawPenny=r=>Number(r?.buy_price)===.01||r?.penny===true||norm(r?.deal_type)==='penny'||Number(r?.current_price)===.01||Number(r?.price)===.01;
const pennyPriceProof=r=>[r?.buy_price,r?.current_price,r?.price,r?.store_price,r?.register_price].some(v=>Number(v)===.01);
const pennyDateProof=r=>[r?.pennied_at,r?.penny_date,r?.penny_start_date].some(absolute);
const pennyLocalProof=(r,radius=50)=>{if(r?.location_verified===true||r?.store_verified===true||r?.exact_store===true||r?.local_verified===true||r?.register_verified===true)return true;const d=Number(r?.distance_miles);return Number.isFinite(d)&&d>=0&&d<=radius&&!!txt(r?.store_key||r?.store_number||r?.store_id||r?.store_address)};
const pennyStatusProof=r=>/(?:confirmed|verified|exact|register)/i.test(txt(r?.evidence_status||r?.verification_status||r?.proof_status||r?.penny_status));
const confirmedPenny=r=>rawPenny(r)&&pennyPriceProof(r)&&(pennyDateProof(r)||pennyLocalProof(r)||pennyStatusProof(r));
const pennyCandidate=r=>rawPenny(r)&&!confirmedPenny(r);

for(const bad of ['First seen at a penny · today','First seen at a penny · yesterday','1¢','1 cent','Penny date unknown','Dollar General Inventory Checker','today']) assert.equal(badTitle(bad),true,`should reject ${bad}`);
for(const good of ["Nathan's Famous Beef Franks 12 oz",'Silk Original Soymilk 64 fl oz','DEWALT 20V MAX Drill Driver Kit']) assert.equal(badTitle(good),false,`should keep ${good}`);

assert.equal(confirmedPenny({retailer:'Home Depot',title:'Tool',penny:true,original_price:69.98}),false,'raw HD penny flag without 1-cent price/proof must not be confirmed');
assert.equal(pennyCandidate({retailer:'Home Depot',title:'Tool',penny:true,original_price:69.98}),true,'unproven raw penny signal must become check-store candidate');
assert.equal(confirmedPenny({retailer:'Dollar General',title:'Named item',buy_price:.01,pennied_at:'2026-09-01T12:00:00Z'}),true,'1-cent item with absolute penny date is confirmed');
assert.equal(confirmedPenny({retailer:'Dollar General',title:'Named item',buy_price:.01,distance_miles:4.2,store_number:'12345'}),true,'1-cent item with local store proof is confirmed');
assert.equal(confirmedPenny({retailer:'Dollar General',title:'Named item',penny:true,pennied_at:'today'}),false,'relative-date community signal without 1-cent price is not confirmed');
assert.equal(pennyCandidate({retailer:'Dollar General',title:'Named item',penny:true,pennied_at:'today'}),true);

console.log('V328_SOURCE_QUALITY_TESTS_PASS');
