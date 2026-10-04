/* H38 Machine Shop module — optional vertical for small machine shops.
 * RFQ intake → supplier quote comparison → markup → owner-approved PO →
 * QC checklist → ship → reorder tracking, plus owner-review price-book templates.
 *
 * VISIBILITY: gated behind the Owner Controls switch 'Machine Shop'
 * (business_module_settings, module_key='machine_shop', default OFF).
 * RFQ workflow, or the shop pricing templates unless the owner flips the
 * switch in Settings → Owner Controls. Onboarding offers a one-tap opt-in
 * for businesses whose type is 'Machine Shop'.
 *
 * Records live in business_records via the generic SAVE_ENTITY path:
 *   shopRfqs, shopSupplierQuotes, shopQcChecks, shopParts, shopShipments
 * Purchase orders reuse the canonical 'purchaseOrders' collection with
 * Approval Status 'Owner Approval Required' — nothing is purchased automatically.
 * Customer quotes reuse the canonical 'quotes' collection (Status 'Draft').
 */
(function(){
'use strict';
const BUILD='20261004-machine-shop-1';
const TOGGLE='machine_shop';

function shopEnabled(){
  try{
    if(window.H38OwnerControls&&typeof window.H38OwnerControls.isMachineShopEnabled==='function')
      return window.H38OwnerControls.isMachineShopEnabled()===true;
    // Fallback: read business_module_settings snapshot directly (default OFF).
    const list=(window.state&&window.state.snapshot&&window.state.snapshot.moduleSettings)||[];
    const row=list.find(r=>String(r.moduleKey||r.module_key)===TOGGLE);
    return row?row.enabled===true:false;
  }catch(e){return false;}
}
function hasRole(){
  try{return typeof can==='function'?(can('manageWork')||can('manageQuotes')):true;}
  catch(e){return true;}
}

/* ---------- navigation integration ---------- */
try{
  if(window.PAGE_DEFS&&!window.PAGE_DEFS.shop)window.PAGE_DEFS.shop=['🏭','Machine Shop'];
  if(window.OFFICE_PAGES&&!window.OFFICE_PAGES.includes('shop'))window.OFFICE_PAGES.push('shop');
  if(typeof H38_PARITY_REQUIREMENTS!=='undefined'&&H38_PARITY_REQUIREMENTS&&!H38_PARITY_REQUIREMENTS.shop){
    H38_PARITY_REQUIREMENTS.shop=['manageWork','manageQuotes'];
  }
  // Desktop nav order/requirements (lexical globals from desktop-navigation-core.js)
  if(typeof ORDER!=='undefined'&&Array.isArray(ORDER)&&!ORDER.includes('shop')){
    const at=Math.max(0,ORDER.indexOf('quotes'));
    ORDER.splice(at,0,'shop');
  }
  if(typeof REQUIREMENTS!=='undefined'&&REQUIREMENTS&&!REQUIREMENTS.shop){
    REQUIREMENTS.shop=['manageWork','manageQuotes'];
  }
}catch(e){/* nav extension is best-effort */}

try{
  const baseAllowed=window.allowedPages;
  if(typeof baseAllowed==='function'&&!baseAllowed.__h38Shop){
    const wrapped=function(){
      const pages=baseAllowed.apply(this,arguments).filter(p=>p!=='shop'||(shopEnabled()&&hasRole()));
      return pages;
    };
    wrapped.__h38Shop=true;
    window.allowedPages=wrapped;
  }
  const baseExpected=window.expectedPages; // desktop nav core
  if(typeof baseExpected==='function'&&!baseExpected.__h38Shop){
    const wrapped=function(){
      return baseExpected.apply(this,arguments).filter(p=>p!=='shop'||(shopEnabled()&&hasRole()));
    };
    wrapped.__h38Shop=true;
    window.expectedPages=wrapped;
  }
  const baseRender=window.renderPage;
  if(typeof baseRender==='function'&&!baseRender.__h38Shop){
    const wrapped=function(){
      if(window.state&&window.state.page==='shop'){renderShop();return;}
      return baseRender.apply(this,arguments);
    };
    wrapped.__h38Shop=true;
    window.renderPage=wrapped;
  }
}catch(e){/* gating wrappers are best-effort */}

/* ---------- small helpers ---------- */
function R(name){try{return records(name)||[];}catch(e){return[];}}
function biz(){return window.state&&window.state.businessId;}
function stamp(){return new Date().toISOString();}
function money(n){try{return window.money?window.money(n):('$'+Number(n||0).toFixed(2));}catch(e){return '$'+Number(n||0).toFixed(2);}}

/* ---------- writes (generic SAVE_ENTITY → business_records) ---------- */
async function saveShop(collection,idField,id,fields){
  const record=Object.assign({id},fields,{
    'Business ID':biz(),'Created Time':stamp(),'Updated Time':stamp(),'Record Version':1
  });
  record[idField]=id;
  await queueOperation('SAVE_ENTITY',collection,id,{entity:collection,record},
    {collection,record,idKeys:['id']});
}

/* ---------- module state ---------- */
let selectedRfqId=null;
let selectedPoId=null;

/* ---------- RFQ ---------- */
async function submitRfq(data,form){
  const id=newId('RFQ');
  await saveShop('shopRfqs','RFQ ID',id,{
    'Customer ID':data.customerId||'','Customer Name':customerName(data.customerId),
    'Part Name':requireValue(data.partName,'Part name is required.'),
    'Part Number':data.partNumber||'','Quantity':num(data.quantity)||1,
    'Material':data.material||'','Tolerance':data.tolerance||'',
    'Due Date':data.dueDate||'','Notes':data.notes||'','Status':'New'
  });
  form.reset();toast('RFQ saved. Add supplier quotes to compare.');
  renderShop();
}
function customerName(id){
  if(!id)return'';
  const c=R('customers').find(r=>String(v(r,'Customer ID','customerId','id'))===String(id));
  return c?v(c,'Customer Name','name'):'';
}
function openRfq(id){selectedRfqId=id;renderShop();}
function rfqQuotes(rfqId){return R('shopSupplierQuotes').filter(q=>String(v(q,'RFQ ID'))===String(rfqId));}

async function submitSupplierQuote(data,form){
  if(!selectedRfqId){toast('Select an RFQ first.',true);return;}
  const id=newId('SQ');
  await saveShop('shopSupplierQuotes','Supplier Quote ID',id,{
    'RFQ ID':selectedRfqId,'Supplier Name':requireValue(data.supplierName,'Supplier name is required.'),
    'Price':num(data.price),'Lead Time Days':num(data.leadDays),
    'Notes':data.notes||'','Status':'Compared'
  });
  // RFQ → Quoted
  const rfq=R('shopRfqs').find(r=>String(v(r,'id','RFQ ID'))===String(selectedRfqId));
  if(rfq)await saveShop('shopRfqs','RFQ ID',selectedRfqId,Object.assign({},plain(rfq),{'Status':'Quoted'}));
  form.reset();toast('Supplier quote added.');
  renderShop();
}
function plain(row){const o={};Object.keys(row||{}).forEach(k=>{if(k!=='__localPending')o[k]=row[k];});return o;}

async function selectWinner(quoteId){
  const quotes=rfqQuotes(selectedRfqId);
  for(const q of quotes){
    const qid=String(v(q,'id','Supplier Quote ID'));
    await saveShop('shopSupplierQuotes','Supplier Quote ID',qid,
      Object.assign({},plain(q),{'Status':qid===String(quoteId)?'Selected':'Compared'}));
  }
  const rfq=R('shopRfqs').find(r=>String(v(r,'id','RFQ ID'))===String(selectedRfqId));
  if(rfq)await saveShop('shopRfqs','RFQ ID',selectedRfqId,Object.assign({},plain(rfq),{'Status':'Supplier Selected'}));
  toast('Winning supplier selected. Apply markup to build the customer quote.');
  renderShop();
}
function winnerQuote(rfqId){
  return rfqQuotes(rfqId).find(q=>String(v(q,'Status')).toLowerCase()==='selected')||null;
}

/* ---------- markup → customer quote draft ---------- */
async function buildQuoteDraft(){
  const rfq=R('shopRfqs').find(r=>String(v(r,'id','RFQ ID'))===String(selectedRfqId));
  const win=winnerQuote(selectedRfqId);
  if(!rfq||!win){toast('Select an RFQ with a winning supplier quote first.',true);return;}
  const pct=num(document.getElementById('shopMarkupPct')?.value||25);
  const cost=num(v(win,'Price')), sell=cost*(1+pct/100);
  const qty=Math.max(1,num(v(rfq,'Quantity'))||1);
  const partName=v(rfq,'Part Name')||'machined part';
  const lines=[{description:'Machine shop: '+partName+' — '+(v(rfq,'Part Number')||'RFQ '+v(rfq,'RFQ ID')),quantity:qty,unit:'each',unitPrice:Math.round(sell/qty*100)/100,rate:Math.round(sell/qty*100)/100,costType:'other',priceSource:'manual_required',rationale:'Owner markup '+pct+'% over winning supplier quote '+money(cost)+' from '+v(win,'Supplier Name')+'. Owner review required.'}];
  const id=newId('QUOTE');
  await queueOperation('SAVE_QUOTE','Quote',id,{
    quoteId:id,customerId:v(rfq,'Customer ID')||'',projectTitle:'Machine shop — '+partName,
    scope:'RFQ '+v(rfq,'RFQ ID')+'. Material: '+(v(rfq,'Material')||'—')+'. Tolerance: '+(v(rfq,'Tolerance')||'—')+'. Qty '+qty+'. Supplier: '+v(win,'Supplier Name')+' at '+money(cost)+' ('+v(win,'Lead Time Days')+' day lead). H38 markup '+pct+'%. DRAFT — owner review required before sending.',
    lines,tax:0
  },{collection:'quotes',record:{id},idKeys:['id']});
  await saveShop('shopRfqs','RFQ ID',selectedRfqId,Object.assign({},plain(rfq),{'Status':'Quote Drafted'}));
  toast('Quote draft created in Quotes. Review before sending.');
  if(window.openPage)window.openPage('quotes');
}

/* ---------- PO (canonical purchaseOrders, owner approval required) ---------- */
async function createPoDraft(){
  const rfq=R('shopRfqs').find(r=>String(v(r,'id','RFQ ID'))===String(selectedRfqId));
  const win=winnerQuote(selectedRfqId);
  if(!rfq||!win){toast('Select an RFQ with a winning supplier quote first.',true);return;}
  if(!confirm('Create a PO DRAFT for '+v(win,'Supplier Name')+' at '+money(v(win,'Price'))+'? Nothing is ordered until the owner approves.'))return;
  const id=newId('PO'),cost=num(v(win,'Price'));
  const record={id,'Purchase Order ID':id,'Business ID':biz(),
    'Vendor ID':'','Job ID':'','Order Number':'SHOP-PO-'+Date.now().toString(36).toUpperCase(),
    'Order Date':new Date().toISOString().slice(0,10),'Expected Date':v(rfq,'Due Date')||'',
    'Description':'Machine shop PO — '+(v(rfq,'Part Name')||'parts')+' × '+(v(rfq,'Quantity')||1)+' from '+v(win,'Supplier Name')+' (RFQ '+v(rfq,'RFQ ID')+')',
    'Category':'Machine Shop','Shop RFQ ID':v(rfq,'RFQ ID'),
    'Subtotal':cost,'Tax':0,'Total':cost,
    'Status':'Draft','Approval Status':'Owner Approval Required',
    'Created By':(window.state&&window.state.snapshot&&window.state.snapshot.user&&window.state.snapshot.user.userId)||'',
    'Created Time':stamp(),'Updated Time':stamp(),'Record Version':1};
  await queueOperation('SAVE_ENTITY','Purchase Order',id,{entity:'purchaseOrders',record},
    {collection:'purchaseOrders',record,idKeys:['Purchase Order ID','id']});
  await saveShop('shopRfqs','RFQ ID',selectedRfqId,Object.assign({},plain(rfq),{'Status':'PO Drafted'}));
  toast('PO draft saved. Owner approval required before ordering.');
  renderShop();
}
function shopPos(){
  return R('purchaseOrders').filter(p=>v(p,'Category')==='Machine Shop'||v(p,'Shop RFQ ID'));
}

/* ---------- QC ---------- */
async function submitQc(data,form){
  if(!selectedPoId){toast('Select a purchase order first.',true);return;}
  const id=newId('QC');
  const checks=['dimOk','qtyOk','finishOk','paperOk','damageOk'];
  const failed=checks.filter(k=>data[k]!=='on');
  await saveShop('shopQcChecks','QC Check ID',id,{
    'PO ID':selectedPoId,
    'Dimensions OK':data.dimOk==='on'?'Yes':'No',
    'Quantity OK':data.qtyOk==='on'?'Yes':'No',
    'Finish OK':data.finishOk==='on'?'Yes':'No',
    'Paperwork OK':data.paperOk==='on'?'Yes':'No',
    'No Damage':data.damageOk==='on'?'Yes':'No',
    'Result':failed.length?'Fail':'Pass',
    'Notes':data.notes||'',
    'Checked By':(window.state&&window.state.snapshot&&window.state.snapshot.user&&window.state.snapshot.user.userId)||''
  });
  form.reset();
  toast(failed.length?'QC recorded: FAIL — see notes.':'QC passed and recorded.');
  renderShop();
}

/* ---------- shipping ---------- */
async function submitShipment(data,form){
  if(!selectedPoId){toast('Select a purchase order first.',true);return;}
  const id=newId('SHIP');
  await saveShop('shopShipments','Shipment ID',id,{
    'PO ID':selectedPoId,'Ship Date':data.shipDate||new Date().toISOString().slice(0,10),
    'Carrier':data.carrier||'','Tracking':data.tracking||'','Status':'Shipped'
  });
  form.reset();toast('Shipment recorded.');
  renderShop();
}

/* ---------- reorder parts ---------- */
async function submitPart(data,form){
  const id=newId('PART');
  await saveShop('shopParts','Part ID',id,{
    'Part Name':requireValue(data.partName,'Part name is required.'),
    'Part Number':data.partNumber||'','Supplier':data.supplier||'',
    'On Hand':num(data.onHand),'Reorder Point':num(data.reorderPoint),
    'Last Order Date':data.lastOrder||'','Notes':data.notes||''
  });
  form.reset();toast('Part saved for reorder tracking.');
  renderShop();
}

/* ---------- templates ---------- */
async function installTemplates(){
  if(!window.H38MachineShopTemplates){toast('Templates module not loaded.',true);return;}
  if(!confirm('Install the 6 machine-shop price-book templates as OWNER-REVIEW drafts? They will NOT be usable in live quotes until you approve each one.'))return;
  try{
    const r=await window.H38MachineShopTemplates.installTemplates();
    toast('Templates installed: '+r.installed+' new, '+r.skipped+' already approved (kept). Review them in Quotes → Price book.');
  }catch(e){toast('Template install failed: '+(e.message||e),true);}
  renderShop();
}

/* ---------- render ---------- */
function renderShop(){
  if(!shopEnabled()){
    $('mainContent').innerHTML=pageHead('Machine Shop','This module is off.')+
      '<div class="notice">The Machine Shop module is disabled. Enable it in Settings → Owner Controls.</div>';
    return;
  }
  const rfqs=R('shopRfqs').slice(0,50),pos=shopPos().slice(0,50),
        parts=R('shopParts').slice(0,50),shipments=R('shopShipments').slice(0,50);
  const openRfqCount=rfqs.filter(r=>!['Quote Drafted','PO Drafted'].includes(String(v(r,'Status')))).length;
  const lowParts=parts.filter(p=>num(v(p,'On Hand'))<=num(v(p,'Reorder Point'))&&v(p,'Part Name'));
  const selRfq=rfqs.find(r=>String(v(r,'id','RFQ ID'))===String(selectedRfqId))||null;
  const selQuotes=selRfq?rfqQuotes(selectedRfqId).sort((a,b)=>num(v(a,'Price'))-num(v(b,'Price'))):[];
  const win=selRfq?winnerQuote(selectedRfqId):null;
  const selPo=pos.find(p=>String(v(p,'id','Purchase Order ID'))===String(selectedPoId))||null;
  const qcForPo=selectedPoId?R('shopQcChecks').filter(q=>String(v(q,'PO ID'))===String(selectedPoId)):[];
  const templates=(window.H38MachineShopTemplates?window.H38MachineShopTemplates.templateRows():[]);

  $('mainContent').innerHTML=pageHead('Machine Shop','RFQ intake → supplier quotes → markup → owner-approved PO → QC → ship → reorder.')+
  '<div class="grid">'+
  '<section class="card"><div class="stats">'+
    '<div class="stat"><strong>'+openRfqCount+'</strong><span>Open RFQs</span></div>'+
    '<div class="stat"><strong>'+pos.filter(p=>String(v(p,'Approval Status')).toLowerCase().includes('required')).length+'</strong><span>POs awaiting approval</span></div>'+
    '<div class="stat"><strong>'+shipments.length+'</strong><span>Shipments</span></div>'+
    '<div class="stat"><strong>'+lowParts.length+'</strong><span>Parts at reorder point</span></div>'+
  '</div></section>'+

  '<section class="card span6"><h2>New RFQ</h2><form id="shopRfqForm">'+
    '<label>Customer</label><select name="customerId">'+optionRows(R('customers'),['Customer ID'],row=>v(row,'Customer Name','name'),'No customer / walk-in')+'</select>'+
    '<div class="two"><div><label>Part name</label><input name="partName" required placeholder="Bearing housing"></div><div><label>Part number</label><input name="partNumber" placeholder="HB-1042"></div></div>'+
    '<div class="three"><div><label>Quantity</label><input name="quantity" type="number" min="1" value="1"></div><div><label>Material</label><input name="material" placeholder="4140 steel"></div><div><label>Tolerance</label><input name="tolerance" placeholder="±0.001"></div></div>'+
    '<label>Due date</label><input name="dueDate" type="date"><label>Notes</label><textarea name="notes" placeholder="Drawing notes, finish, heat treat…"></textarea>'+
    '<div class="actions"><button>Save RFQ</button></div></form></section>'+

  '<section class="card span6"><h2>RFQs</h2><div class="list">'+
    (rfqs.length?rfqs.map(r=>{const id=String(v(r,'id','RFQ ID'));return '<div class="row"><div class="row-top"><strong>'+esc(v(r,'Part Name'))+'</strong>'+pill(v(r,'Status')||'New')+'</div><small>'+esc(v(r,'Customer Name')||'walk-in')+' · qty '+esc(v(r,'Quantity'))+' · '+esc(v(r,'Material'))+' · due '+esc(dateOnly(v(r,'Due Date')))+'</small><div class="actions"><button type="button" data-shop-rfq="'+esc(id)+'">Open</button></div></div>';}).join(''):empty('No RFQs yet.'))+
  '</div></section>'+

  '<section class="card span7"><h2>Supplier quotes'+(selRfq?' — '+esc(v(selRfq,'Part Name')):'')+'</h2>'+
    (selRfq?
      '<form id="shopQuoteForm"><div class="three"><div><label>Supplier</label><input name="supplierName" required></div><div><label>Price</label><input name="price" type="number" step="0.01" required></div><div><label>Lead time (days)</label><input name="leadDays" type="number"></div></div><label>Notes</label><input name="notes"><div class="actions"><button>Add supplier quote</button></div></form>'+
      '<div class="list">'+(selQuotes.length?selQuotes.map((q,i)=>{const qid=String(v(q,'id','Supplier Quote ID'));const best=i===0;const fastest=selQuotes.reduce((m,x)=>Math.min(m,num(v(x,'Lead Time Days'))||1e9),1e9)===num(v(q,'Lead Time Days'));const sel=String(v(q,'Status')).toLowerCase()==='selected';return '<div class="row"><div class="row-top"><strong>'+esc(v(q,'Supplier Name'))+'</strong>'+(sel?pill('Selected','good'):pill(v(q,'Status')))+'</div><small>'+money(v(q,'Price'))+(best?' · <strong>lowest price</strong>':'')+(fastest&&num(v(q,'Lead Time Days'))?' · fastest ('+esc(v(q,'Lead Time Days'))+'d)':'')+(v(q,'Notes')?' · '+esc(v(q,'Notes')):'')+'</small>'+(sel?'':'<div class="actions"><button type="button" data-shop-winner="'+esc(qid)+'">Select winner</button></div>')+'</div>';}).join(''):empty('No supplier quotes yet.'))+'</div>'
    :empty('Select an RFQ to compare supplier quotes.'))+
  '</section>'+

  '<section class="card span5"><h2>Markup → customer quote</h2>'+
    (win?
      '<p><strong>'+esc(v(win,'Supplier Name'))+'</strong> · cost '+money(v(win,'Price'))+'</p><label>Markup %</label><input id="shopMarkupPct" type="number" value="25" min="0"><p class="muted small">Sell price: <strong id="shopSellPrice">'+money(num(v(win,'Price'))*1.25)+'</strong></p><div class="actions"><button type="button" id="shopBuildQuote">Create quote draft</button> <button type="button" id="shopCreatePo" class="secondary">Create PO draft</button></div><p class="muted small">Quote drafts land in Quotes for owner review. PO drafts require owner approval — nothing is ordered automatically.</p>'
    :empty('Select a winning supplier quote first.'))+
  '</section>'+

  '<section class="card span6"><h2>Purchase orders</h2><div class="list">'+
    (pos.length?pos.map(p=>{const id=String(v(p,'id','Purchase Order ID'));return '<div class="row"><div class="row-top"><strong>'+esc(v(p,'Order Number'))+'</strong>'+pill(v(p,'Approval Status')||v(p,'Status'))+'</div><small>'+money(v(p,'Total'))+' · '+esc(v(p,'Description'))+'</small><div class="actions"><button type="button" data-shop-po="'+esc(id)+'">QC / Ship</button></div></div>';}).join(''):empty('No shop purchase orders.'))+
  '</div></section>'+

  '<section class="card span6"><h2>QC &amp; shipping'+(selPo?' — '+esc(v(selPo,'Order Number')):'')+'</h2>'+
    (selPo?
      '<h3>Receiving QC checklist</h3><form id="shopQcForm"><div class="two"><div><label><input type="checkbox" name="dimOk"> Dimensions verified</label></div><div><label><input type="checkbox" name="qtyOk"> Quantity count correct</label></div></div><div class="two"><div><label><input type="checkbox" name="finishOk"> Finish / surface OK</label></div><div><label><input type="checkbox" name="paperOk"> Packing slip / paperwork</label></div></div><label><input type="checkbox" name="damageOk"> No shipping damage</label><label>QC notes</label><textarea name="notes"></textarea><div class="actions"><button>Record QC</button></div></form>'+
      '<div class="list">'+(qcForPo.length?qcForPo.map(q=>'<div class="row"><div class="row-top"><strong>QC '+esc(dateOnly(v(q,'Created Time')))+'</strong>'+pill(v(q,'Result'),String(v(q,'Result')).toLowerCase()==='pass'?'good':'bad')+'</div><small>'+esc(v(q,'Notes'))+'</small></div>').join(''):empty('No QC checks for this PO.'))+'</div>'+
      '<h3>Ship</h3><form id="shopShipForm"><div class="three"><div><label>Ship date</label><input name="shipDate" type="date"></div><div><label>Carrier</label><input name="carrier"></div><div><label>Tracking</label><input name="tracking"></div></div><div class="actions"><button>Record shipment</button></div></form>'
    :empty('Select a purchase order to run QC and shipping.'))+
  '</section>'+

  '<section class="card span6"><h2>Reorder tracking</h2><form id="shopPartForm"><div class="two"><div><label>Part name</label><input name="partName" required></div><div><label>Part number</label><input name="partNumber"></div></div><div class="three"><div><label>Supplier</label><input name="supplier"></div><div><label>On hand</label><input name="onHand" type="number"></div><div><label>Reorder point</label><input name="reorderPoint" type="number"></div></div><label>Last order date</label><input name="lastOrder" type="date"><div class="actions"><button>Save part</button></div></form>'+
  '<div class="list">'+(parts.length?parts.map(p=>{const low=num(v(p,'On Hand'))<=num(v(p,'Reorder Point'));return '<div class="row"><div class="row-top"><strong>'+esc(v(p,'Part Name'))+'</strong>'+(low?pill('Reorder','bad'):pill('OK','good'))+'</div><small>'+esc(v(p,'Part Number'))+' · '+esc(v(p,'Supplier'))+' · on hand '+esc(v(p,'On Hand'))+' / reorder at '+esc(v(p,'Reorder Point'))+'</small></div>';}).join(''):empty('No tracked parts.'))+'</div></section>'+

  '<section class="card span6"><h2>Shop price-book templates</h2><p class="muted small">Owner-review drafts from the queued machining rates. They cannot be used in live quotes until you approve each one.</p><div class="list">'+
    (templates.length?templates.map(t=>'<div class="row"><div class="row-top"><strong>'+esc(t.code)+'</strong>'+pill(t.status,'pending')+'</div><small>'+esc(t.description)+' · '+money(t.rate)+'/'+esc(t.unit)+'</small></div>').join(''):empty('Templates not loaded.'))+
  '</div><div class="actions"><button type="button" id="shopInstallTemplates" class="secondary">Install owner-review templates</button></div></section>'+

  '</div>';

  bindForm('shopRfqForm',submitRfq);
  bindForm('shopQuoteForm',submitSupplierQuote);
  bindForm('shopQcForm',submitQc);
  bindForm('shopShipForm',submitShipment);
  bindForm('shopPartForm',submitPart);
  document.querySelectorAll('[data-shop-rfq]').forEach(b=>b.onclick=()=>openRfq(b.dataset.shopRfq));
  document.querySelectorAll('[data-shop-winner]').forEach(b=>b.onclick=()=>selectWinner(b.dataset.shopWinner));
  document.querySelectorAll('[data-shop-po]').forEach(b=>b.onclick=()=>{selectedPoId=b.dataset.shopPo;renderShop();});
  const pct=$('shopMarkupPct'),sell=$('shopSellPrice');
  if(pct&&sell&&win)pct.oninput=()=>{sell.textContent=money(num(v(win,'Price'))*(1+num(pct.value)/100));};
  const bq=$('shopBuildQuote');if(bq)bq.onclick=buildQuoteDraft;
  const cp=$('shopCreatePo');if(cp)cp.onclick=createPoDraft;
  const it=$('shopInstallTemplates');if(it)it.onclick=installTemplates;
}

window.H38MachineShop={BUILD,enabled:shopEnabled,render:renderShop,TOGGLE};
})();
