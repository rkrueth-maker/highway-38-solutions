import assert from 'node:assert/strict';
import {aggregate,parsePennyGeneral,parsePennyPinchinMom,CANONICAL_IDENTITY_VERSION} from './core.mjs';

const dgBaseUpc={retailer:'Dollar General',title:'Fresh Step Simply Unscented Multi Cat Clumping Litter, 14 lb',upc:'044600013107',deal_type:'penny',buy_price:.01,posted_date:'2026-08-25',source_name:'Krazy Coupon Lady',source_url:'https://thekrazycouponlady.com/dg',signal_domain:'thekrazycouponlady.com',signal_sources:[{name:'Krazy Coupon Lady',domain:'thekrazycouponlady.com',url:'https://thekrazycouponlady.com/dg'}]};
const dgBaseSku={retailer:'Dollar General',title:'Fresh Step Simply Unscented Multi Cat Clumping Litter, 14 lb',sku:'36075901',deal_type:'penny',buy_price:.01,last_seen:'today',source_name:'Penny Tree',source_url:'https://pennytree.org/item.php?sku=36075901',signal_domain:'pennytree.org',signal_sources:[{name:'Penny Tree',domain:'pennytree.org',url:'https://pennytree.org/a'},{name:'Penny Tree other page',domain:'pennytree.org',url:'https://pennytree.org/b'}]};
const pgHtml=`Dollar General penny list\nAugust 25, 2026\n19 items Permalink\nImage\nFresh Step Simply Unscented Multi Cat Clumping Litter, 14 lb\nUPC\n044600013107\nSKU\n36075901\n$0.01\n1¢\nRubbermaid TakeAlongs Small Squares\nSKU\n71691519805\n$1.26`;
const pg=parsePennyGeneral(pgHtml);
assert.equal(pg.length,1,'PennyGeneral must parse exact penny products but reject section/image artifacts and non-penny markdowns');
let merged=aggregate([dgBaseUpc,dgBaseSku,...pg]);
assert.equal(merged.length,1,'UPC+SKU bridge must collapse two prior DG clusters into one card');
assert.equal(merged[0].signal_source_count,3,'independent source domains must merge under one DG card');
assert.ok(merged[0].upc&&merged[0].sku,'canonical DG card must preserve both UPC and SKU');
assert.equal(merged[0].canonical_identity_version,CANONICAL_IDENTITY_VERSION);
assert.equal(merged[0].pennied_at,'','new report dates must not fabricate Date pennied');
assert.equal(merged[0].penny_date,'','unknown penny-start date stays unknown');

const hdPc={retailer:'Home Depot',title:'Flex Install Panel 6 in. x 48 in.',sku:'1009-122-005',deal_type:'penny',buy_price:.01,pennied_at:'2026-08-10',source_name:'PennyCentral',source_url:'https://www.pennycentral.com/penny-list',signal_domain:'pennycentral.com'};
const ppmHtml=`8/24/2026 Home Depot Penny List\nHome Depot Deals for 8/24/2026\nFlex Install Panel 6 in. x 48 in. – SKU: 1009-122-005\nSlayer Max Flashlight – SKU 1010604171\nDeals from 6/27/2026\nOrbit Satin Chrome Door Knob- UPC: 043156939824`;
const ppm=parsePennyPinchinMom(ppmHtml);
assert.equal(ppm.length,3,'Penny Pinchin Mom parser must support colon/no-colon SKU plus UPC rows');
merged=aggregate([hdPc,...ppm]);
assert.equal(merged.filter(x=>String(x.sku).replace(/\D/g,'')==='1009122005').length,1,'same Home Depot SKU must remain one card');
const hd=merged.find(x=>String(x.sku).replace(/\D/g,'')==='1009122005');
assert.equal(hd.signal_source_count,2,'Home Depot evidence sources should merge under one card');
assert.equal(hd.pennied_at,'2026-08-10','explicit upstream Date pennied must survive enrichment');

const lookalikes=aggregate([
 {retailer:'Dollar General',title:'Blue Storage Tote',upc:'111111111111',deal_type:'penny',buy_price:.01,source_name:'A',source_url:'https://a.example/1',signal_domain:'a.example'},
 {retailer:'Dollar General',title:'Blue Storage Tote',upc:'222222222222',deal_type:'penny',buy_price:.01,source_name:'B',source_url:'https://b.example/2',signal_domain:'b.example'}
]);
assert.equal(lookalikes.length,2,'different strong UPC identities must never merge on title alone');

const sameDomain=aggregate([
 {retailer:'Dollar General',title:'Paper Plates',upc:'333333333333',deal_type:'penny',buy_price:.01,source_name:'Penny Tree',source_url:'https://pennytree.org/a',signal_domain:'pennytree.org'},
 {retailer:'Dollar General',title:'Paper Plates',upc:'333333333333',deal_type:'penny',buy_price:.01,source_name:'Penny Tree alt',source_url:'https://pennytree.org/b',signal_domain:'pennytree.org'}
]);
assert.equal(sameDomain.length,1);
assert.equal(sameDomain[0].signal_source_count,1,'multiple pages on one domain count as one independent source');

console.log('PASS canonical multi-source fixtures');
