import assert from 'node:assert/strict';
import {parseRetailShoutRaw,parsePennyGeneralRaw,parsePennyTreeIndex,runDollarGeneralSourceOrchestrator} from './dg-source-orchestrator.mjs';

{
  const html='<h4>CoverGirl TruBlend Liquid Makeup, Shade M3 Golden Beige, 30 ml</h4><div>Penny Date: Aug 25, 2026</div><div><b>SKU:</b> 22361301 &middot; <b>UPC:</b> 8100009909</div>';
  const rows=parseRetailShoutRaw(html);
  assert.equal(rows.length,1);assert.equal(rows[0].upc,'8100009909');assert.equal(rows[0].sku,'22361301');assert.equal(rows[0].pennied_at,'2026-08-25');
}
{
  const html='<h2>August 25, 2026</h2><h3>Believe Beauty Cosmetic Sponge Mini-3</h3><div>UPC</div><div>840797138537</div><div>SKU</div><div>25723601</div><div>$0.01</div>';
  const rows=parsePennyGeneralRaw(html);
  assert.equal(rows.length,1);assert.equal(rows[0].upc,'840797138537');assert.equal(rows[0].sku,'25723601');assert.equal(rows[0].pennied_at,'2026-08-25');
}
{
  const html='<h2>September 1, 2099</h2><h3>Future Item Must Not Be Live</h3><div>UPC</div><div>810087820275</div><div>SKU</div><div>36209601</div><div>$0.01</div>';
  const rows=parsePennyGeneralRaw(html);
  assert.equal(rows.length,0,'future effective list must not become current penny inventory');
}
{
  const rows=parsePennyTreeIndex('<description>$0.01 Tone Body Wash, Miami Glow Up, 16 fl oz Other / Misc Just became a penny · today SKU dg:17000195797</description>');
  assert.equal(rows.length,1);assert.equal(rows[0].upc,'17000195797');assert.equal(rows[0].freshness_unproven,true);assert.equal(rows[0].evidence_role,'search_index_fallback');
}
{
  const calls=[];
  const fakeFetch=async url=>{calls.push(String(url));const u=String(url);
    if(u.includes('retailshout.com'))return{ok:true,text:async()=>'<h4>Raw Block Item</h4><div>Penny Date: Aug 25, 2026</div><div><b>SKU:</b></div><div><span>12345678</span></div><div><b>UPC:</b></div><div><span>8100009909</span></div>'};
    if(u.includes('pennytree.org/guide.php'))return{ok:false,status:403,text:async()=>''};
    if(u.includes('pennygeneral.net'))return{ok:true,text:async()=>'<h2>August 25, 2026</h2><h3>Database Item</h3><div>Product UPC</div><div>840797138537</div><div>$0.01</div>'};
    if(u.includes('kristiesconnections.com'))return{ok:true,text:async()=>'<a>August 25, 2026 Penny List</a><p>REPUBLICATION OF THESE IMAGES IS NOT PERMITTED</p>'};
    if(u.includes('thekrazycouponlady.com'))return{ok:true,text:async()=>'<p>KCL Item — UPC: 52200010310</p>'};
    if(u.includes('thefreebieguy.com'))return{ok:true,text:async()=>'<p>Freebie Item – 613008756451</p>'};
    if(u.includes('crazy4couponing.com'))return{ok:true,text:async()=>'<h3>Crazy Item</h3><p>UPC: 613008756451</p>'};
    if(u.includes('pennypuss.com'))return{ok:true,text:async()=>'<h3>Puss Item</h3><p>UPC: 613008756451</p>'};
    if(u.includes('freestufffinder.com'))return{ok:true,text:async()=>'<html>No identifiers here</html>'};
    if(u.includes('bing.com/search')&&decodeURIComponent(u).includes('pennytree'))return{ok:true,text:async()=>'<description>$0.01 Indexed PennyTree Item SKU dg:17000195797</description>'};
    if(u.includes('bing.com/search'))return{ok:true,text:async()=>'<html>No identifier</html>'};
    return{ok:true,text:async()=>'<html></html>'};
  };
  const result=await runDollarGeneralSourceOrchestrator(fakeFetch);
  const rs=result.source_status.find(s=>s.adapter_id==='dg-retailshout');
  const pg=result.source_status.find(s=>s.adapter_id==='dg-pennygeneral');
  const pt=result.source_status.find(s=>s.adapter_id==='dg-pennytree');
  const kc=result.source_status.find(s=>s.adapter_id==='dg-kristies-reference');
  assert.equal(rs?.strategy,'direct_raw_block');
  assert.equal(pg?.strategy,'direct_raw_block');
  assert.equal(pt?.strategy,'source_specific_index');
  assert.equal(kc?.status,'REFERENCE_ONLY');
  assert.ok(result.rows.some(r=>r.upc==='8100009909'));
  assert.ok(result.rows.some(r=>r.upc==='840797138537'));
  assert.ok(result.rows.some(r=>r.upc==='17000195797'));
}
console.log('DG specialized source orchestrator tests passed');
