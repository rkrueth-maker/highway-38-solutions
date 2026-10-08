/* inventory-module.js — Inventory & Materials module (build 20261008-inventory-module-5)
 *
 * Toggle: inventory_enabled (Owner Controls, default OFF, server-mirrored in
 * business_module_settings by owner-controls.js). When OFF, nothing inventory
 * appears: no nav entry, no pickers, no alerts, no stock movement.
 *
 * Items live in price_book_items (sell_price / reorder_point / sellable /
 * rentable / rental_rate / advertise columns, 2026-10-08 migration). Stock is
 * derived from the append-only inventoryTransactions ledger — the same math
 * renderInventory and the low-stock checker already use. Stock moves ONLY
 * when a human receives/issues it on the Inventory page, or when a payment
 * is recorded on an invoice carrying stock-item lines (decrementForInvoice,
 * dedupe-flagged per line). Nothing auto-orders, nothing auto-sends.
 */
(function(){
'use strict';
const BUILD='20261008-inventory-module-5';
const text=v=>String(v==null?'':v).trim();

function oc(){return window.H38OwnerControls||null;}
function isEnabled(){try{const o=oc();return !!(o&&o.isInventoryEnabled&&o.isInventoryEnabled());}catch(e){return false;}}
function role(){try{return text(window.state&&window.state.snapshot&&window.state.snapshot.user&&window.state.snapshot.user.roleName).toLowerCase();}catch(e){return '';}}
function canEdit(){return ['owner','administrator'].includes(role());}
function api(){const c=window.H38_SUPABASE_SHARED_CLIENT;return c&&c.ensure?c.ensure():null;}
function bid(){return text(window.state&&window.state.businessId);}
function itemId(row){return text(v(row,'Item ID'));}
function sellPrice(row){const sp=num(v(row,'Sell Price'));return sp>0?sp:num(v(row,'Selling Price'));}
function stockMap(){
  if(window.H38Inventory&&window.H38Inventory.computeStock)return window.H38Inventory.computeStock();
  const m=new Map();
  (records('inventoryTransactions')||[]).forEach(r=>{
    const id=text(v(r,'Item ID'));if(!id)return;
    const q=Math.abs(num(v(r,'Quantity')));
    m.set(id,(m.get(id)||0)+(String(v(r,'Direction')).toUpperCase()==='OUT'?-q:q));
  });
  return m;
}
function onHand(row){return stockMap().get(itemId(row))||0;}
function availability(row){
  const oh=onHand(row),rp=num(v(row,'Reorder Point'));
  if(oh<=0)return 'Out of stock';
  if(rp>0&&oh<=rp)return 'Low — limited stock';
  return 'In stock';
}
function isLow(row){const rp=num(v(row,'Reorder Point'));return rp>0&&onHand(row)<=rp;}

/* ------------------------------------------------------------------ */
/* Item editor (Inventory page)                                        */
/* ------------------------------------------------------------------ */
let allItems=[]; // raw price_book_items rows from the editor's own fetch

function editorCard(){
  if(!isEnabled())return '';
  const items=records('priceBook')||[];
  const low=items.filter(isLow).length;
  return `<section class="card span12" id="h38InventoryEditor"><h2>📦 Items — stock, sell &amp; rent</h2>`
    +`<p class="muted small">${items.length} active item${items.length===1?'':'s'} · ${low} at or below reorder point. One list runs everything: receive and issue below, sell on quotes and invoices, flag items to advertise. Stock never moves on its own.</p>`
    +(canEdit()?editorForm():'<p class="muted small">Only an owner or administrator can add or change items. Receiving and issuing stock below still works.</p>')
    +`<div id="h38InvAllItems" class="list"><p class="muted small">Loading all items…</p></div></section>`;
}

function editorForm(){
  return `<form id="h38InvItemForm"><input type="hidden" name="editingId">`
    +`<div class="three"><div><label>Item name</label><input name="description" required placeholder="Bulk salt — per ton"></div>`
    +`<div><label>SKU / code</label><input name="itemCode" placeholder="auto if blank"></div>`
    +`<div><label>Category</label><input name="category" value="Materials"></div></div>`
    +`<div class="three"><div><label>Unit</label><input name="unit" list="h38InvUnits" value="each"><datalist id="h38InvUnits"><option value="each"></option><option value="bag"></option><option value="ton"></option><option value="lb"></option><option value="gal"></option><option value="case"></option><option value="hour"></option></datalist></div>`
    +`<div><label>Your cost</label><input name="unitCost" type="number" step="0.01" min="0"></div>`
    +`<div><label>Sell price</label><input name="sellPrice" type="number" step="0.01" min="0" placeholder="blank = same as cost"></div></div>`
    +`<div class="three"><div><label>Reorder point</label><input name="reorderPoint" type="number" step="0.01" min="0" placeholder="blank = no reorder flag"></div>`
    +`<div><label>Rental rate (per unit)</label><input name="rentalRate" type="number" step="0.01" min="0"></div>`
    +`<div><label>Flags</label><div class="actions">`
    +`<label><input type="checkbox" name="sellable" checked> Sellable</label>`
    +`<label><input type="checkbox" name="rentable"> Rentable</label>`
    +`<label><input type="checkbox" name="advertise"> Advertise stock</label>`
    +`<label><input type="checkbox" name="active" checked> Active</label>`
    +`</div></div></div>`
    +`<div class="actions"><button id="h38InvSaveBtn">Add item</button><button type="button" class="secondary" id="h38InvClearBtn">Clear</button></div></form>`;
}

function mapRow(row){
  return {
    'Item ID':row.id,'SKU':row.item_code,'Category':row.category,'Description':row.description,
    'Unit of Measure':row.unit,'Purchase Cost':num(row.unit_cost),
    'Selling Price':num(row.sell_price!=null?row.sell_price:row.unit_cost),
    'Sell Price':row.sell_price!=null?num(row.sell_price):'',
    'Reorder Point':row.reorder_point!=null?num(row.reorder_point):0,
    'Sellable':row.sellable!==false,'Rentable':row.rentable===true,
    'Rental Rate':row.rental_rate!=null?num(row.rental_rate):'',
    'Advertise':row.advertise===true,'Active':row.active!==false,
    'Source Type':row.source_type,'Source Note':row.source_note||'',
    'Approval Status':row.approval_status,'Updated Time':row.updated_at
  };
}

function spliceSnapshot(row){
  try{
    const snap=window.state&&window.state.snapshot;if(!snap)return;
    const list=snap.priceBook||(snap.priceBook=[]);
    const i=list.findIndex(r=>itemId(r)===row.id);
    if(row.active===false){if(i>=0)list.splice(i,1);return;}
    const mapped=mapRow(row);
    if(i>=0)list[i]=mapped;else list.push(mapped);
  }catch(e){}
}

async function listAllItems(box){
  const client=api();
  if(!client){box.innerHTML='<p class="muted small">Secure connection unavailable — item management needs a live sign-in.</p>';return;}
  const res=await client.from('price_book_items')
    .select('id,item_code,category,description,unit,unit_cost,sell_price,reorder_point,sellable,rentable,rental_rate,advertise,source_type,source_note,approval_status,active,updated_at')
    .eq('business_id',bid()).order('category').order('description').range(0,999);
  if(res.error){box.innerHTML='<p class="muted small">Could not load items: '+esc(res.error.message||'unknown error')+'</p>';return;}
  allItems=res.data||[];
  const stock=stockMap();
  box.innerHTML=allItems.length?allItems.map(row=>{
    const oh=stock.get(row.id)||0;
    const flags=[row.sellable!==false?'sell':'',row.rentable?'rent':'',row.advertise?'📣':'',row.active===false?'inactive':''].filter(Boolean).join(' · ');
    return `<div class="row"><div class="row-top"><strong>${esc(row.description)}</strong>${pill(oh+' '+(row.unit||''),num(row.reorder_point)>0&&oh<=num(row.reorder_point)?'bad':'good')}</div>`
      +`<small>${esc(row.item_code)} · cost ${money(num(row.unit_cost))} · sell ${money(row.sell_price!=null?num(row.sell_price):num(row.unit_cost))}${row.rentable?` · rents ${money(num(row.rental_rate))}`:''} · reorder at ${row.reorder_point!=null?num(row.reorder_point):'—'}${flags?' · '+esc(flags):''}</small>`
      +(canEdit()?`<div class="actions"><button type="button" class="secondary" data-h38-inv-edit="${esc(row.id)}">Edit</button></div>`:'')
      +`</div>`;
  }).join(''):'<p class="muted small">No items yet. Add the first one above.</p>';
  box.querySelectorAll('[data-h38-inv-edit]').forEach(b=>{b.onclick=()=>editItem(b.dataset.h38InvEdit);});
}

function editItem(id){
  const row=allItems.find(r=>r.id===id);
  const form=document.getElementById('h38InvItemForm');
  if(!row||!form)return;
  form.elements.editingId.value=row.id;
  form.elements.description.value=row.description||'';
  form.elements.itemCode.value=row.item_code||'';
  form.elements.category.value=row.category||'Materials';
  form.elements.unit.value=row.unit||'each';
  form.elements.unitCost.value=row.unit_cost!=null?row.unit_cost:'';
  form.elements.sellPrice.value=row.sell_price!=null?row.sell_price:'';
  form.elements.reorderPoint.value=row.reorder_point!=null?row.reorder_point:'';
  form.elements.rentalRate.value=row.rental_rate!=null?row.rental_rate:'';
  form.elements.sellable.checked=row.sellable!==false;
  form.elements.rentable.checked=row.rentable===true;
  form.elements.advertise.checked=row.advertise===true;
  form.elements.active.checked=row.active!==false;
  const btn=document.getElementById('h38InvSaveBtn');if(btn)btn.textContent='Save changes';
  form.scrollIntoView({behavior:'smooth',block:'center'});
}

function clearForm(){
  const form=document.getElementById('h38InvItemForm');
  if(!form)return;
  form.reset();
  form.elements.editingId.value='';
  form.elements.category.value='Materials';
  form.elements.unit.value='each';
  form.elements.sellable.checked=true;
  form.elements.active.checked=true;
  const btn=document.getElementById('h38InvSaveBtn');if(btn)btn.textContent='Add item';
}

async function saveItem(e){
  e.preventDefault();
  const form=e.target;
  const client=api();
  if(!client){toast('Secure connection unavailable. Sign in again, then retry.',true);return;}
  const name=text(form.elements.description.value);
  if(!name){toast('Item name is required.',true);return;}
  let code=text(form.elements.itemCode.value);
  if(!code)code=(name.toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,20)||'ITEM')+'-'+Date.now().toString(36).toUpperCase().slice(-4);
  const numOrNull=el=>{const s=text(el.value);if(s==='')return null;const n=Number(s);return Number.isFinite(n)?n:null;};
  const editingId=text(form.elements.editingId.value);
  const payload={
    item_code:code,
    category:text(form.elements.category.value)||'Materials',
    description:name,
    unit:text(form.elements.unit.value)||'each',
    unit_cost:numOrNull(form.elements.unitCost)||0,
    sell_price:numOrNull(form.elements.sellPrice),
    reorder_point:numOrNull(form.elements.reorderPoint),
    sellable:!!form.elements.sellable.checked,
    rentable:!!form.elements.rentable.checked,
    rental_rate:!!form.elements.rentable.checked?numOrNull(form.elements.rentalRate):null,
    advertise:!!form.elements.advertise.checked,
    active:!!form.elements.active.checked,
    updated_at:new Date().toISOString()
  };
  try{
    let saved;
    if(editingId){
      const res=await client.from('price_book_items').update(payload).eq('id',editingId).eq('business_id',bid()).select().single();
      if(res.error)throw res.error;
      saved=res.data;
    }else{
      const ins=Object.assign({business_id:bid(),source_type:'business',approval_status:canEdit()?'approved':'owner_review_required'},payload);
      const res=await client.from('price_book_items').insert(ins).select().single();
      if(res.error)throw res.error;
      saved=res.data;
    }
    spliceSnapshot(saved);
    toast(editingId?'Item saved.':'Item added.');
    if(typeof renderInventory==='function')renderInventory();
  }catch(err){
    const msg=String(err&&err.message||err);
    toast(/duplicate key|unique/i.test(msg)?'That SKU / code is already used by another item. Change the SKU and save again.':'Could not save item: '+msg,true);
  }
}

/* ------------------------------------------------------------------ */
/* Advertised stock (owner-copiable; no cost, no exact counts)         */
/* ------------------------------------------------------------------ */
function advertisedCard(){
  if(!isEnabled())return '';
  const rows=(records('priceBook')||[]).filter(r=>v(r,'Advertise')===true&&v(r,'Active')!==false);
  const body=rows.length?rows.map(r=>{
    const av=availability(r);
    return `<div class="row"><div class="row-top"><strong>${esc(v(r,'Description'))}</strong>${pill(av,av==='In stock'?'good':av==='Out of stock'?'bad':'warn')}</div>`
      +`<small>${esc(v(r,'Unit of Measure')||'each')}${v(r,'Rentable')?' · rentals available':''} · ask us for today's price</small></div>`;
  }).join(''):empty('No items flagged for advertising yet. Edit an item above and tick “Advertise stock”.');
  return `<section class="card span12"><h2>📣 Advertised stock</h2>`
    +`<p class="muted small">What customers may see: item names and availability only — never your cost or exact counts. Copy this list into an ad, a post, or your website.</p>`
    +`<div class="list">${body}</div>`
    +(rows.length?'<div class="actions"><button type="button" class="secondary" id="h38InvCopyAd">Copy advertised list</button></div>':'')
    +`</section>`;
}

function advertisedText(){
  const rows=(records('priceBook')||[]).filter(r=>v(r,'Advertise')===true&&v(r,'Active')!==false);
  const biz=text(window.state&&window.state.snapshot&&window.state.snapshot.business&&window.state.snapshot.business.businessName)||'Now in stock';
  return [biz+' — in stock now:']
    .concat(rows.map(r=>`• ${v(r,'Description')} — ${availability(r)}${v(r,'Rentable')?' (rentals available)':''}`))
    .join('\n');
}

async function copyAdvertised(){
  const txt=advertisedText();
  try{
    await navigator.clipboard.writeText(txt);
    toast('Advertised list copied. Paste it anywhere.');
  }catch(e){
    toast('Copy failed — your browser blocked it. The list above can be selected and copied by hand.',true);
  }
}

/* ------------------------------------------------------------------ */
/* Money: invoice stock-item picker                                    */
/* ------------------------------------------------------------------ */
function invoicePicker(){
  if(!isEnabled())return '';
  const items=(records('priceBook')||[]).filter(r=>v(r,'Sellable')!==false&&v(r,'Active')!==false);
  if(!items.length)return '';
  const stock=stockMap();
  return `<label>Sell from stock (optional)</label><select id="h38InvItemSelect"><option value="">— pick an item to fill the line —</option>`
    +items.map(r=>`<option value="${esc(itemId(r))}">${esc(v(r,'Description'))} — ${money(sellPrice(r))} / ${esc(v(r,'Unit of Measure')||'each')} · ${stock.get(itemId(r))||0} on hand</option>`).join('')
    +`</select>`;
}

function bindMoneyPage(){
  const sel=document.getElementById('h38InvItemSelect');
  const form=document.getElementById('invoiceForm');
  if(!sel||!form||sel.dataset.bound)return;
  sel.dataset.bound='1';
  sel.addEventListener('change',()=>{
    const row=(records('priceBook')||[]).find(r=>itemId(r)===sel.value);
    if(!row){form.dataset.invItemId='';return;}
    form.dataset.invItemId=sel.value;
    const d=form.querySelector('[name="description"]');if(d)d.value=v(row,'Description');
    const p=form.querySelector('[name="unitPrice"]');if(p)p.value=sellPrice(row).toFixed(2);
  });
}

/* ------------------------------------------------------------------ */
/* Payment-time decrement — append-only OUT rows, per-line dedupe flag */
/* ------------------------------------------------------------------ */
async function decrementForInvoice(invoice){
  if(!isEnabled()||!invoice)return false;
  const lines=Array.isArray(invoice.lines)?invoice.lines:[];
  const todo=lines.filter(l=>l&&l.inventoryItemId&&!l.stockDecremented);
  if(!todo.length)return false;
  const invId=text(v(invoice,'Invoice ID'));
  const invNo=text(v(invoice,'Invoice Number'))||invId;
  const existing=records('inventoryTransactions')||[];
  let wrote=false;
  for(const line of todo){
    const lineKey=text(line.quoteLineId||line.lineId||'');
    const dupe=existing.some(t=>text(v(t,'Invoice ID'))===invId
      &&text(v(t,'Item ID'))===text(line.inventoryItemId)
      &&(lineKey?text(v(t,'Sale Line ID'))===lineKey:true));
    if(!dupe){
      const id=newId('TXN');
      const record={'Transaction ID':id,'Business ID':bid(),'Item ID':text(line.inventoryItemId),
        'Quantity':num(line.quantity)||1,'Direction':'OUT','Unit Cost':0,
        'Job ID':text(v(invoice,'Job ID')),'Reason':'Sale · invoice '+invNo,
        'Invoice ID':invId,'Sale Line ID':lineKey,'Timestamp':now(),'Record Version':1};
      await queueOperation('POST_INVENTORY','Inventory Transaction',id,
        {itemId:record['Item ID'],quantity:record.Quantity,direction:'OUT',operationId:id},
        {collection:'inventoryTransactions',record,idKeys:['Transaction ID']});
      existing.push(record);
      wrote=true;
    }
    line.stockDecremented=true;
  }
  const updated=Object.assign({},invoice,{lines:lines,'Updated Time':now(),'Record Version':Math.max(1,num(v(invoice,'Record Version'))+1)});
  await queueOperation('SAVE_ENTITY','Invoice',invId,{entity:'invoices',record:updated},{collection:'invoices',record:updated,idKeys:['Invoice ID']},false);
  return wrote;
}

/* ------------------------------------------------------------------ */
/* Quotes: pending stock-item link between price-book "Use" and Add    */
/* ------------------------------------------------------------------ */
let pending=null;
function injectQuotePicker(){
  if(!isEnabled())return;
  if(!window.state||window.state.page!=='quotes')return;
  if(document.getElementById('h38InvQuotePick'))return;
  var editor=document.getElementById('singlePriceEditor');
  if(!editor)return;
  var lineRow=editor.querySelector('.quote-line');
  if(!lineRow)return;
  var sellable=(records('priceBook')||[]).filter(function(r){return v(r,'Sellable')!==false&&v(r,'Active')!==false;});
  var box=document.createElement('div');
  box.id='h38InvQuotePick';
  box.className='h38-inv-pick';
  if(!sellable.length){
    box.innerHTML='<p class="muted small">Stock items: none sellable yet. Add items on the Inventory page.</p>';
  }else{
    var opts=sellable.map(function(r){return '<option value="'+esc(itemId(r))+'">'+esc(v(r,'Description'))+' — '+money(sellPrice(r))+' / '+esc(v(r,'Unit')||v(r,'Unit of Measure')||'each')+'</option>';}).join('');
    box.innerHTML='<label>Sell a stock item</label><div class="h38-inv-pick-row"><select id="h38InvQuoteSelect">'+opts+'</select><input id="h38InvQuoteQty" type="number" min="0.01" step="0.01" value="1" aria-label="Quantity"><button type="button" id="h38InvQuoteAdd">Add stock line</button></div><p class="muted small">Inserts a line at the item\u2019s sell price — editable on the quote. Stock moves when the invoice is paid.</p>';
  }
  lineRow.insertAdjacentElement('afterend',box);
  var addBtn=document.getElementById('h38InvQuoteAdd');
  if(addBtn){
    addBtn.addEventListener('click',function(){
      var sel=document.getElementById('h38InvQuoteSelect');
      var row=sellable.find(function(r){return itemId(r)===sel.value;});
      if(!row)return;
      var desc=document.getElementById('lineDescription'),unit=document.getElementById('lineUnit'),price=document.getElementById('linePrice'),qty=document.getElementById('lineQuantity');
      if(desc)desc.value=v(row,'Description');
      if(unit)unit.value=v(row,'Unit')||v(row,'Unit of Measure')||'each';
      if(price)price.value=sellPrice(row).toFixed(2);
      var q=document.getElementById('h38InvQuoteQty');
      if(qty&&q)qty.value=q.value||'1';
      notePendingItem(row);
      var addLine=document.getElementById('addQuoteLine');
      if(addLine)addLine.click();
    });
  }
}
function wrapRenderQuotes(){
  if(typeof window.renderQuotes!=='function'||window.renderQuotes.__h38InvWrapped)return;
  var base=window.renderQuotes;
  var wrapped=function(){var r=base.apply(this,arguments);try{injectQuotePicker();}catch(_){ }return r;};
  wrapped.__h38InvWrapped=true;
  window.renderQuotes=wrapped;
}

function notePendingItem(row){
  if(!isEnabled()||!row)return;
  if(v(row,'Sellable')===false){pending=null;renderChip();return;}
  pending={id:itemId(row),name:v(row,'Description')};
  renderChip();
}
function renderChip(){
  const host=document.querySelector('.quote-line');
  if(!host)return;
  let chip=document.getElementById('h38PendingItemChip');
  if(!pending){if(chip)chip.remove();return;}
  if(!chip){
    chip=document.createElement('div');
    chip.id='h38PendingItemChip';
    chip.className='notice';
    host.insertAdjacentElement('afterend',chip);
  }
  chip.innerHTML='📦 Stock item: <strong>'+esc(pending.name)+'</strong> — the next line you Add draws from inventory when its invoice is paid. <button type="button" class="secondary" id="h38PendingClear">Don’t link</button>';
  const b=document.getElementById('h38PendingClear');
  if(b)b.onclick=()=>{pending=null;renderChip();};
}
function takePendingItem(){
  const p=pending;pending=null;renderChip();
  return p?p.id:'';
}

/* ------------------------------------------------------------------ */
/* Nav gate + page binding                                             */
/* ------------------------------------------------------------------ */
function gateNav(){
  const base=window.allowedPages;
  if(typeof base!=='function'||base.__h38InventoryGate)return;
  const wrapped=function(){
    const pages=base.apply(this,arguments).slice();
    const shell=(window.state&&window.state.shell)||'office';
    if(shell==='office'&&!isEnabled()){
      const i=pages.indexOf('inventory');
      if(i>=0)pages.splice(i,1);
    }
    return pages;
  };
  wrapped.__h38InventoryGate=true;
  window.allowedPages=wrapped;
}

function bindInventoryPage(){
  if(!isEnabled())return;
  const form=document.getElementById('h38InvItemForm');
  if(form&&!form.dataset.bound){
    form.dataset.bound='1';
    form.addEventListener('submit',saveItem);
    const clear=document.getElementById('h38InvClearBtn');
    if(clear)clear.onclick=clearForm;
  }
  const box=document.getElementById('h38InvAllItems');
  if(box&&!box.dataset.bound){box.dataset.bound='1';listAllItems(box).catch(()=>{});}
  const copyBtn=document.getElementById('h38InvCopyAd');
  if(copyBtn&&!copyBtn.dataset.bound){copyBtn.dataset.bound='1';copyBtn.onclick=copyAdvertised;}
}

function wrapRenderInventory(){
  const base=window.renderInventory;
  if(typeof base!=='function'||base.__h38InvWrap)return;
  const wrapped=function(){
    const r=base.apply(this,arguments);
    try{bindInventoryPage();}catch(e){}
    return r;
  };
  wrapped.__h38InvWrap=true;
  window.renderInventory=wrapped;
}

window.addEventListener('h38:office-page-rendered',e=>{
  const p=e&&e.detail&&e.detail.page;
  if(p==='inventory')bindInventoryPage();
  if(p==='money')bindMoneyPage();
  if(p==='quotes'){renderChip();try{injectQuotePicker();}catch(_){}}
});

gateNav();
wrapRenderInventory();
  wrapRenderQuotes();

window.H38InventoryModule={
  BUILD:BUILD,
  isEnabled:isEnabled,
  editorCard:editorCard,
  advertisedCard:advertisedCard,
  invoicePicker:invoicePicker,
  notePendingItem:notePendingItem,
  takePendingItem:takePendingItem,
  decrementForInvoice:decrementForInvoice,
  availability:availability,
  onHand:onHand,
  sellPrice:sellPrice
};
})();
