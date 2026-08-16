(function(){
'use strict';
const BUILD='20260815-2045';
const H38_BUSINESS_ID='10b85a89-5834-436d-95b0-c6ee2eb335ad';
const PAINT_OPTION_ID='5ee6e994-d2dd-4695-bb14-8a878841af83';
const PAINT_FALLBACK={
  catalogId:PAINT_OPTION_ID,
  description:'OPTIONAL — Prime and paint new drywall allowance — per new drywall SF',
  unit:'SF',
  rate:1.75
};
let catalogPromise=null;
let decorating=false;

const text=value=>String(value==null?'':value).trim();
const number=value=>{const parsed=Number(value==null?0:value);return Number.isFinite(parsed)?parsed:0;};
const html=value=>typeof window.esc==='function'?window.esc(value):text(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>typeof window.money==='function'?window.money(value):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(number(value));
function lineValue(line,...keys){for(const key of keys){if(line&&line[key]!==undefined&&line[key]!==null&&line[key]!=='')return line[key];}return'';}
function lineDescription(line){return text(lineValue(line,'Description','description'));}
function lineQuantity(line){return number(lineValue(line,'Quantity','quantity'));}
function lineUnit(line){return text(lineValue(line,'Unit','unit')||'each');}
function lineRate(line){return number(lineValue(line,'Unit Price','unitPrice','rate'));}
function isOptional(line){return Boolean(line?.optional===true||line?.isOptional===true||/^\s*optional\b/i.test(lineDescription(line)));}
function isPaint(line){return /\b(prime|paint|painting)\b/i.test(lineDescription(line));}
function isGarageDoor(line){return /garage\s*doors?/i.test(lineDescription(line));}
function cleanOptionLabel(value){return text(value).replace(/^\s*optional\s*[—–:\-]+\s*/i,'').replace(/\s*[—–-]\s*owner\s+option(?:al)?\.?\s*$/i,'').replace(/\s*\(owner\s+option(?:al)?\)\s*/ig,' ').replace(/\s+/g,' ').trim();}
function quoteLines(){try{return Array.isArray(window.state?.quote?.lines)?window.state.quote.lines:[];}catch(_){return[];}}
function quoteScope(){try{return text(window.state?.quote?.scope||document.getElementById('quoteScope')?.value);}catch(_){return'';}}
function quoteMeasurements(){try{return text(window.state?.quote?.measurementNotes||document.getElementById('quoteMeasurements')?.value);}catch(_){return'';}}
function hasDrywallScope(lines){return /\b(drywall|sheet\s*rock|sheetrock)\b/i.test(`${quoteScope()} ${lines.map(lineDescription).join(' ')}`);}
function netDrywallSf(lines){
  const base=lines.filter(line=>!isOptional(line));
  const labor=base.filter(line=>/\b(drywall|sheet\s*rock|sheetrock)\b/i.test(lineDescription(line))&&/\b(labor|hang|hanging|tape|taping|finish|finishing)\b/i.test(lineDescription(line)));
  const laborSf=labor.filter(line=>/^(sf|sq\.?\s*ft|square\s*feet?)$/i.test(lineUnit(line))).reduce((sum,line)=>sum+lineQuantity(line),0);
  if(laborSf>0)return laborSf;
  const materials=base.filter(line=>/\b(drywall|sheet\s*rock|sheetrock)\b/i.test(lineDescription(line))&&/\b(material|board|sheet|panel|gypsum)\b/i.test(lineDescription(line))&&/^(sf|sq\.?\s*ft|square\s*feet?)$/i.test(lineUnit(line)));
  const materialSf=materials.reduce((sum,line)=>sum+lineQuantity(line),0);
  return materialSf>0?Math.round((materialSf/1.1)*100)/100:0;
}
function supabaseClient(){
  try{if(window.H38_SUPABASE_SHARED_CLIENT?.ensure)return window.H38_SUPABASE_SHARED_CLIENT.ensure();}catch(_){}
  const config=window.H38_BUSINESS_OFFICE_SUPABASE||{};
  if(window.supabase&&config.url&&config.publishableKey)return window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
  return null;
}
async function loadCatalog(){
  if(catalogPromise)return catalogPromise;
  catalogPromise=(async()=>{
    const businessId=text(window.state?.businessId);
    if(!businessId)return[];
    try{
      const client=supabaseClient();
      if(!client)return[];
      const result=await client.from('price_book_items').select('id,item_code,description,unit,unit_cost,source_type,approval_status').eq('business_id',businessId).eq('active',true).ilike('description','OPTIONAL%').order('description');
      if(result.error)throw result.error;
      return (result.data||[]).map(row=>({catalogId:text(row.id),itemCode:text(row.item_code),description:text(row.description),unit:text(row.unit),rate:number(row.unit_cost),sourceType:text(row.source_type),approvalStatus:text(row.approval_status)})).filter(row=>row.rate>0);
    }catch(error){console.warn('[H38 quote options] live option catalog unavailable',error);return[];}
  })();
  return catalogPromise;
}
function quoteTax(){
  try{
    if(typeof window.h38CurrentQuoteRecord==='function'&&typeof window.v==='function')return number(window.v(window.h38CurrentQuoteRecord(),'Tax','tax'));
  }catch(_){}
  const rows=Array.from(document.querySelectorAll('#quotePreviewDocument .quote-totals>div'));
  const taxRow=rows.find(row=>/^tax$/i.test(text(row.querySelector('span')?.textContent)));
  if(!taxRow)return 0;
  return number(text(taxRow.querySelector('strong')?.textContent).replace(/[^0-9.-]/g,''));
}
function lineRow(line){
  const quantity=lineQuantity(line),rate=lineRate(line);
  return `<tr><td>${html(lineDescription(line))}</td><td>${html(quantity)}</td><td>${html(lineUnit(line))}</td><td>${money(rate)}</td><td>${money(quantity*rate)}</td></tr>`;
}
function optionFromLine(line){
  const quantity=lineQuantity(line),rate=lineRate(line);
  return {key:text(line.quoteLineId||line['Quote Line ID']||lineDescription(line)),catalogId:text(line.catalogId||''),description:cleanOptionLabel(lineDescription(line)),quantity,unit:lineUnit(line),rate,amount:quantity*rate,source:'quote'};
}
function optionFromCatalog(row,quantity){
  return {key:row.catalogId||row.itemCode||row.description,catalogId:row.catalogId||'',description:cleanOptionLabel(row.description),quantity,unit:row.unit||'each',rate:number(row.rate),amount:quantity*number(row.rate),source:'catalog'};
}
function fallbackPaintOption(quantity){return optionFromCatalog(PAINT_FALLBACK,quantity);}
async function availableOptions(lines){
  const options=lines.filter(isOptional).map(optionFromLine).filter(option=>option.quantity>0&&option.rate>0);
  const hasPaint=options.some(option=>/\b(prime|paint|painting)\b/i.test(option.description));
  if(!hasPaint&&hasDrywallScope(lines)){
    const quantity=netDrywallSf(lines);
    if(quantity>0){
      const catalog=await loadCatalog();
      const paint=catalog.find(row=>row.catalogId===PAINT_OPTION_ID)||catalog.find(row=>/^\s*optional\b/i.test(row.description)&&/\b(prime|paint|painting)\b/i.test(row.description));
      if(paint&&paint.rate>0)options.push(optionFromCatalog(paint,quantity));
      else if(text(window.state?.businessId)===H38_BUSINESS_ID)options.push(fallbackPaintOption(quantity));
    }
  }
  const seen=new Set();
  return options.filter(option=>{const identity=(isPaint({description:option.description})?'paint':isGarageDoor({description:option.description})?'garage-door':option.key).toLowerCase();if(seen.has(identity))return false;seen.add(identity);return true;});
}
function optionMarkup(option,index){
  return `<label class="h38-customer-option" data-option-key="${html(option.key)}"><input type="checkbox" data-h38-customer-option="${index}" aria-label="Add ${html(option.description)}"><span class="h38-option-check" aria-hidden="true">✓</span><span class="h38-option-copy"><strong>${html(option.description)}</strong><small>${html(option.quantity)} ${html(option.unit)} × ${money(option.rate)}</small></span><strong class="h38-option-price">${money(option.amount)}</strong></label>`;
}
function installStyles(){
  if(document.getElementById('h38QuoteCustomerOptionsStyle'))return;
  const style=document.createElement('style');style.id='h38QuoteCustomerOptionsStyle';style.textContent=`
#h38CustomerOptionalAddOns{margin-top:22px;padding-top:18px;border-top:2px solid #0b2438;break-inside:auto}
#h38CustomerOptionalAddOns h2{margin:0 0 5px;color:#0b2438}.h38-option-intro{margin:0 0 12px;color:#526373;font-size:.92rem;line-height:1.45}
.h38-customer-option{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;align-items:center;gap:9px;padding:12px 0;border-top:1px solid #dce4ea;cursor:pointer;break-inside:avoid}
.h38-customer-option input{position:absolute;opacity:0;pointer-events:none}.h38-option-check{width:24px;height:24px;border:2px solid #0b5f78;border-radius:5px;display:grid;place-items:center;color:transparent;font-weight:900}.h38-customer-option:has(input:checked) .h38-option-check{background:#0b5f78;color:white}
.h38-option-copy{display:flex;flex-direction:column;gap:2px}.h38-option-copy strong{color:#132b3e}.h38-option-copy small{color:#5c6d79}.h38-option-price{white-space:nowrap;color:#132b3e}
.h38-option-totals{margin-top:12px;margin-left:auto;max-width:360px;border-top:1px solid #cdd8df;padding-top:9px}.h38-option-totals>div{display:flex;justify-content:space-between;gap:16px;padding:4px 0}.h38-option-totals .grand{font-size:1.08rem;color:#0b2438;border-top:2px solid #0b2438;margin-top:4px;padding-top:8px}
.h38-option-note{margin:10px 0 0;font-size:.78rem;color:#61717d}.h38-owner-client-options{margin-top:14px}.h38-owner-client-options .h38-owner-option-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--line)}
@media(max-width:560px){.h38-customer-option{grid-template-columns:auto auto minmax(0,1fr);}.h38-option-price{grid-column:3;justify-self:start}.h38-option-totals{max-width:none}}
@media print{#h38CustomerOptionalAddOns{break-before:auto}.h38-customer-option{cursor:default}.h38-option-check{color:transparent!important;background:#fff!important}.h38-customer-option:has(input:checked) .h38-option-check{color:#0b2438!important}.h38-option-intro,.h38-option-note{color:#3f4f5a!important}}
`;
  document.head.appendChild(style);
}
function updateOptionTotals(root,baseTotal){
  const checked=Array.from(root.querySelectorAll('input[data-h38-customer-option]:checked'));
  const selected=checked.reduce((sum,input)=>sum+number(input.closest('.h38-customer-option')?.dataset.amount),0);
  const selectedNode=root.querySelector('[data-h38-selected-options-total]');
  const combinedNode=root.querySelector('[data-h38-total-with-options]');
  if(selectedNode)selectedNode.textContent=money(selected);
  if(combinedNode)combinedNode.textContent=money(baseTotal+selected);
}
async function decoratePreview(){
  const documentNode=document.getElementById('quotePreviewDocument');
  if(!documentNode||decorating)return;
  decorating=true;
  try{
    installStyles();
    const lines=quoteLines(),baseLines=lines.filter(line=>!isOptional(line));
    const options=await availableOptions(lines);
    const tbody=documentNode.querySelector('.quote-table tbody');
    if(tbody)tbody.innerHTML=baseLines.map(lineRow).join('');
    const baseSubtotal=baseLines.reduce((sum,line)=>sum+lineQuantity(line)*lineRate(line),0),tax=quoteTax(),baseTotal=baseSubtotal+tax;
    const totals=documentNode.querySelector('.quote-totals');
    if(totals)totals.innerHTML=`<div><span>Base subtotal</span><strong>${money(baseSubtotal)}</strong></div>${tax?`<div><span>Tax</span><strong>${money(tax)}</strong></div>`:''}<div class="grand"><span>Base quote total</span><strong id="quotePreviewTotal">${money(baseTotal)}</strong></div>`;
    document.getElementById('h38CustomerOptionalAddOns')?.remove();
    if(options.length&&totals){
      const section=document.createElement('section');section.id='h38CustomerOptionalAddOns';section.className='quote-copy';section.innerHTML=`<h2>Optional add-ons</h2><p class="h38-option-intro">These items are not included in the base quote. Select any options you would like added.</p><div class="h38-option-list">${options.map(optionMarkup).join('')}</div><div class="h38-option-totals"><div><span>Selected options</span><strong data-h38-selected-options-total>${money(0)}</strong></div><div class="grand"><span>Total with selected options</span><strong data-h38-total-with-options>${money(baseTotal)}</strong></div></div><p class="h38-option-note">Selecting an option requests it for the proposal. It does not authorize work, payment, purchasing or scheduling by itself.</p>`;
      totals.insertAdjacentElement('afterend',section);
      Array.from(section.querySelectorAll('.h38-customer-option')).forEach((row,index)=>{row.dataset.amount=String(options[index].amount);});
      section.addEventListener('change',event=>{if(event.target?.matches?.('input[data-h38-customer-option]'))updateOptionTotals(section,baseTotal);});
    }
    documentNode.dataset.h38CustomerOptionsBuild=BUILD;
  }finally{decorating=false;}
}
async function decorateOwnerQuote(){
  if(!document.getElementById('quoteCustomer')||document.getElementById('quotePreviewDocument'))return;
  const lines=quoteLines();if(!lines.length)return;
  const options=await availableOptions(lines);if(!options.length)return;
  const main=document.getElementById('mainContent');if(!main)return;
  let panel=document.getElementById('h38OwnerClientOptions');
  if(!panel){
    panel=document.createElement('section');panel.id='h38OwnerClientOptions';panel.className='card h38-owner-client-options';
    const quoteCard=Array.from(main.querySelectorAll('.card')).find(card=>/quote draft/i.test(text(card.querySelector('h2')?.textContent)));
    if(quoteCard)quoteCard.insertAdjacentElement('afterend',panel);else main.appendChild(panel);
  }
  panel.innerHTML=`<div class="row-top"><div><h2>Client options</h2><p class="muted">Shown after the base proposal and excluded from the base total until selected.</p></div><span class="pill good">${options.length}</span></div>${options.map(option=>`<div class="h38-owner-option-row"><span><strong>${html(option.description)}</strong><br><small>${html(option.quantity)} ${html(option.unit)} × ${money(option.rate)}</small></span><strong>${money(option.amount)}</strong></div>`).join('')}`;
}
function schedule(){
  setTimeout(()=>{if(document.getElementById('quotePreviewDocument'))decoratePreview();else decorateOwnerQuote();},0);
}
document.addEventListener('click',event=>{if(event.target?.closest?.('#previewQuoteButton,#backToQuoteFromPreview'))setTimeout(schedule,0);},true);
new MutationObserver(mutations=>{if(mutations.some(mutation=>Array.from(mutation.addedNodes||[]).some(node=>node.nodeType===1&&(node.id==='quotePreviewDocument'||node.querySelector?.('#quotePreviewDocument,#quoteCustomer')))))schedule();}).observe(document.documentElement,{childList:true,subtree:true});
installStyles();
schedule();
window.H38_QUOTE_CUSTOMER_OPTIONS=Object.freeze({enabled:true,build:BUILD,baseQuoteExcludesOptions:true,customerSelectable:true,automaticApproval:false,automaticSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false});
})();
