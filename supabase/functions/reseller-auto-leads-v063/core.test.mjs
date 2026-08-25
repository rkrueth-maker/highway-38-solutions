import assert from 'node:assert/strict';
import {aggregate,parsePennyGeneral,parsePennyPinchinMom,CANONICAL_IDENTITY_VERSION} from './core.mjs';

const dgBaseUpc={retailer:'Dollar General',title:'Fresh Step Cat Litter 14 lb',upc:'044600013107',deal_type:'penny',buy_price:.01,posted_date:'2026-08-25',source_name:'Krazy Coupon Lady',source_url:'https://thekrazycouponlady.com/dg',signal_domain:'thekrazycouponlady.com',signal_sources:[{name:'Krazy Coupon Lady',domain:'thekrazycouponlady.com',url:'https://thekrazycouponlady.com/dg'}]};
const dgBaseSku={retailer:'Dollar General',title:'Fresh Step Cat Litter 14 lb',sku:'26547801',deal_type:'penny',buy_price:.01,last_seen:'today',source_name:'Penny Tree',source_url:'https://pennytree.org/item.php?sku=26547801',signal_domain:'pennytree.org',signal_sources:[{name:'Penny Tree',domain:'pennytree.org',url:'https://pennytree.org/a'},{name:'Penny Tree other page',domain:'pennytree.org',url:'https://pennytree.org/b'}]};
const pgHtml=`August 25, 2026\nFresh Step Cat Litter 14 lb\nUPC\n044600013107\nSKU\n26547801\n$0.01`;
const pg=parsePennyGeneral(pgHtml);
assert.equal(pg.length,1,'PennyGeneral fixture should parse one exact DG row');
let merged=aggregate([dgBaseUpc,dgBaseSku,...pg]);
assert.equal(merged.length,1,'UPC+SKU bridge must collapse two prior DG clusters into one card');
assert.equal(merged[0].signal_source_count,3,'independent source domains must merge under one DG card');
assert.ok(merged[0].upc&&merged[0].sku,'canonical DG card must preserve both UPC and SKU');
assert.equal(merged[0].canonical_identity_version,CANONICAL_IDENTITY_VERSION);
assert.equal(merged[0].pennied_at,'','new report dates must not fabricate Date pennied');
assert.equal(merged[0].penny_date,'','unknown penny-start date stays unknown');

const hdPc={retailer:'Home Depot',title:'Flex Install Panel',sku:'1009-122-005',deal_type:'penny',buy_price:.01,pennied_at:'2026-08-10',source_name:'PennyCentral',source_url:'https://www.pennycentral.com/penny-list',signal_domain:'pennycentral.com'};
const ppmHtml=`Home Depot Deals for 8/24/2026\nFlex Install Panel – SKU: 1009-122-005`;
const ppm=parsePennyPinchinMom(ppmHtml);
assert.equal(ppm.length,1,'Penny Pinchin Mom fixture should parse one exact Home Depot row');
merged=aggregate([hdPc,...ppm]);
assert.equal(merged.length,1,'same Home Depot SKU must remain one card');
assert.equal(merged[0].signal_source_count,2,'Home Depot evidence sources should merge under one card');
assert.equal(merged[0].pennied_at,'2026-08-10','explicit upstream Date pennied must survive enrichment');

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
