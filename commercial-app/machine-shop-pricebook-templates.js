/* H38 Machine Shop — owner-review price-book templates.
 * Seeded from the six machining rules in the Lane 2 approval queue
 * (business_approvals, action_type='pricing_rules_seed', 2026-10-02;
 * contractor-pricing-reference.md section 12). Every template installs with
 * approval_status='owner_review_required' — the shop owner must review and
 * approve each rate before it can be used in a live customer quote.
 * Nothing here is a live price. Installing writes drafts only.
 */
(function(){
'use strict';
const BUILD='20261004-machine-shop-templates-1';

const TEMPLATES=[
  {item_code:'MACH_3AXIS_HR',category:'Machine Shop',description:'3-axis CNC mill — shop billed rate (machine + tooling + overhead, not the machinist wage)',unit:'USD/hour',unit_cost:80,source_type:'local_research',source_note:'US job-shop billed rates, rural-adjusted (contractor-pricing-reference.md §12). Owner-review template — confirm against your own shop rate before quoting.'},
  {item_code:'MACH_LATHE_HR',category:'Machine Shop',description:'CNC lathe / turning center — shop billed rate',unit:'USD/hour',unit_cost:75,source_type:'local_research',source_note:'US job-shop billed rates, rural-adjusted (contractor-pricing-reference.md §12). Owner-review template — confirm against your own shop rate before quoting.'},
  {item_code:'MACH_5AXIS_HR',category:'Machine Shop',description:'5-axis CNC — shop billed rate (complex geometry, tight tolerances)',unit:'USD/hour',unit_cost:160,source_type:'local_research',source_note:'US job-shop billed rates, rural-adjusted (contractor-pricing-reference.md §12). Owner-review template — confirm against your own shop rate before quoting.'},
  {item_code:'MACH_WELD_HR',category:'Machine Shop',description:'Welding / fabrication — shop billed rate',unit:'USD/hour',unit_cost:90,source_type:'local_research',source_note:'US job-shop billed rates, rural-adjusted (contractor-pricing-reference.md §12). Owner-review template — confirm against your own shop rate before quoting.'},
  {item_code:'MACH_SETUP_JOB',category:'Machine Shop',description:'Setup / fixturing / programming — one-time charge per part number',unit:'USD/job',unit_cost:100,source_type:'local_research',source_note:'Typical $50–$200 per job (contractor-pricing-reference.md §12). Owner-review template — amortize over quantity on larger runs.'},
  {item_code:'MACH_MINIMUM_LOT',category:'Machine Shop',description:'Minimum lot charge — floor price for any small job',unit:'USD/job',unit_cost:200,source_type:'local_research',source_note:'Many shops run $150–$300 minimum (contractor-pricing-reference.md §12). Owner-review template — set your own floor.'},
];

function text(v){return String(v==null?'':v).trim();}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}

async function installTemplates(){
  const api=window.H38_SUPABASE_SHARED_CLIENT?.ensure?.();
  if(!api)throw new Error('Secure price-book connection is unavailable.');
  const session=await api.auth.getUser();
  if(session.error||!session.data?.user)throw new Error('Sign in again before installing templates.');
  const businessId=text(window.state?.businessId);
  if(!businessId)throw new Error('Open a business first.');
  const userId=session.data.user.id, today=new Date().toISOString().slice(0,10);
  let installed=0, skipped=0;
  for(const t of TEMPLATES){
    const existing=await api.from('price_book_items').select('id,approval_status').eq('business_id',businessId).eq('item_code',t.item_code).maybeSingle();
    if(existing.error)throw new Error('Price-book lookup failed: '+(existing.error.message||'unknown error'));
    if(existing.data?.approval_status==='approved'){skipped++;continue;} // never overwrite an owner-approved rate
    const payload={business_id:businessId,item_code:t.item_code,category:t.category,description:t.description,unit:t.unit,unit_cost:num(t.unit_cost),source_type:t.source_type,source_note:t.source_note+' Installed '+today+'.',approval_status:'owner_review_required',active:true,created_by:userId,updated_at:new Date().toISOString()};
    if(existing.data?.id){
      const up=await api.from('price_book_items').update(payload).eq('id',existing.data.id).eq('business_id',businessId);
      if(up.error)throw new Error('Price-book update failed: '+(up.error.message||'unknown error'));
    }else{
      const ins=await api.from('price_book_items').insert(payload);
      if(ins.error)throw new Error('Price-book insert failed: '+(ins.error.message||'unknown error'));
    }
    installed++;
  }
  return {installed,skipped,total:TEMPLATES.length};
}

function templateRows(){
  return TEMPLATES.map(t=>({code:t.item_code,description:t.description,unit:t.unit,rate:t.unit_cost,status:'owner_review_required'}));
}

window.H38MachineShopTemplates={BUILD,TEMPLATES,templateRows,installTemplates};
})();
