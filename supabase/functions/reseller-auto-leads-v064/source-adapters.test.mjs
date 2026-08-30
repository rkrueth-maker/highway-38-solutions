import assert from 'node:assert/strict';
import {
  parseRetailShout,parseKcl,parseFreebieGuy,parseCrazy4Couponing,parsePennyPuss,
  parsePennyTree,parsePennyGeneralLike,parseIndexedFallback,
  runDollarGeneralAdapters,mergeDollarGeneralEvidence,DG_SOURCE_ADAPTERS
} from './source-adapters.mjs';

const by=id=>DG_SOURCE_ADAPTERS.find(x=>x.id===id);
const upc='012345678901';

{
  const rows=parseRetailShout('<h3>Beech-Nut Veggies Stage 2 Baby Food</h3><p>Penny Date: August 28, 2026</p><p>SKU: 987654 UPC: 012345678901</p>',by('dg-retailshout'));
  assert.equal(rows.length,1);assert.equal(rows[0].upc,upc);assert.equal(rows[0].sku,'987654');assert.equal(rows[0].pennied_at,'2026-08-28');
}
{
  const rows=parseKcl('<h2>Dollar General Penny List August 25, 2026</h2><p>Gain Original Detergent — UPC: 012345678901</p>',by('dg-kcl'));
  assert.equal(rows.length,1);assert.equal(rows[0].title,'Gain Original Detergent');assert.equal(rows[0].upc,upc);
}
{
  const rows=parseFreebieGuy('<h2>Penny Items August 25, 2026</h2><p>Hartz Grooming Brush – 012345678901</p>',by('dg-freebieguy'));
  assert.equal(rows.length,1);assert.equal(rows[0].upc,upc);
}
{
  const rows=parseCrazy4Couponing('<h3>Believe Beauty Nail Polish</h3><p>UPC: 012345678901</p>',by('dg-crazy4couponing'));
  assert.equal(rows.length,1);assert.equal(rows[0].title,'Believe Beauty Nail Polish');
}
{
  const rows=parsePennyPuss('<h3>DG Hair Accessory Surprise Penny</h3><p>UPC: 012345678901</p>',by('dg-pennypuss'));
  assert.equal(rows.length,1);assert.equal(rows[0].upc,upc);
}
{
  const rows=parsePennyTree('<div>$0.01 Hartz UltraGuard Collar Other / Misc</div><div>SKU dg:012345678901</div>',by('dg-pennytree'));
  assert.equal(rows.length,1);assert.equal(rows[0].title,'Hartz UltraGuard Collar');assert.equal(rows[0].upc,upc);
}
{
  const rows=parsePennyGeneralLike('<h2>August 27, 2026</h2><h3>Febreze Small Spaces</h3><div>UPC</div><div>012345678901</div><div>$0.01</div>',by('dg-pennygeneral'));
  assert.equal(rows.length,1);assert.equal(rows[0].upc,upc);assert.equal(rows[0].pennied_at,'2026-08-27');
}
{
  const rows=parseIndexedFallback('<item><title>DG clearance lead</title><description>Dollar General item UPC: 012345678901 penny list</description></item>',by('dg-kcl'));
  assert.equal(rows.length,1);assert.equal(rows[0].freshness_unproven,true);assert.equal(rows[0].source_strategy,'search_index_fallback');assert.equal(rows[0].evidence_role,'search_index_fallback');
}
{
  const base=[{retailer:'Dollar General',title:'Same Item',upc,signal_sources:[{name:'The Krazy Coupon Lady',domain:'thekrazycouponlady.com',url:'https://thekrazycouponlady.com/old'}]}];
  const primary=parseFreebieGuy('<p>Same Item – 012345678901</p>',by('dg-freebieguy'))[0];
  const catalog=parsePennyTree('<div>$0.01 Same Item</div><div>SKU dg:012345678901</div>',by('dg-pennytree'))[0];
  const aggregator=parsePennyGeneralLike('<h3>Same Item</h3><div>UPC</div><div>012345678901</div><div>$0.01</div>',by('dg-pennygeneral'))[0];
  const merged=mergeDollarGeneralEvidence(base,[primary,catalog,aggregator]);
  assert.equal(merged.length,1,'same UPC must remain one product');
  assert.equal(merged[0].signal_source_count,2,'KCL + FreebieGuy are two independent source groups');
  assert.equal(merged[0].signal_confidence,'MEDIUM');
  assert.ok(merged[0].signal_source_total>=4,'catalog/aggregator evidence remains visible without inflating confidence');
}
{
  let directCalls=0,indexCalls=0;
  const fakeFetch=async url=>{
    if(String(url).includes('bing.com/search')){indexCalls++;return{ok:true,text:async()=>'<item><title>Fallback DG item</title><description>UPC: 012345678901 penny</description></item>'}}
    directCalls++;
    if(String(url).includes('retailshout.com'))return{ok:true,text:async()=>'<h3>Direct RetailShout Item</h3><p>Penny Date: August 28, 2026</p><p>SKU: 112233 UPC: 099999999999</p>'};
    if(String(url).includes('pennypuss.com'))throw new Error('simulated source outage');
    return{ok:true,text:async()=>'<html><body>No identifiable rows</body></html>'};
  };
  const result=await runDollarGeneralAdapters(fakeFetch);
  assert.equal(result.source_status.length,DG_SOURCE_ADAPTERS.length,'every source owns an independent status');
  assert.ok(result.source_status.some(s=>s.adapter_id==='dg-retailshout'&&s.status==='AVAILABLE'));
  assert.ok(result.source_status.some(s=>s.adapter_id==='dg-pennypuss'&&s.status==='DEGRADED'),'failed direct source may fall back independently');
  assert.ok(result.rows.some(r=>r.upc==='099999999999'),'one source failure must not erase another source result');
  assert.ok(result.rows.some(r=>r.freshness_unproven===true),'index fallback candidates stay freshness-unproven');
  assert.ok(directCalls>=DG_SOURCE_ADAPTERS.length);assert.ok(indexCalls>=1);
}

console.log('DG source adapter tests passed');
