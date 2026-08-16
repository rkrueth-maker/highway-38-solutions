(function(){
'use strict';
const BUILD='20260815-2110';
const H38_BUSINESS_ID='10b85a89-5834-436d-95b0-c6ee2eb335ad';
const PAINT_OPTION={description:'Prime and paint new drywall',unit:'SF',rate:1.75};
let scheduled=false;
let decorating=false;

const text=value=>String(value==null?'':value).trim();
const number=value=>{const parsed=Number(value==null?0:value);return Number.isFinite(parsed)?parsed:0;};
const html=value=>text(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(number(value));
function description(line){return text(line?.customerDescription||line?.description||line?.Description);}
function quantity(line){return number(line?.quantity??line?.Quantity);}
function unit(line){return text(line?.unit||line?.Unit||'each');}
function rate(line){return number(line?.unitPrice??line?.rate??line?.['Unit Price']);}
function optional(line){return Boolean(line?.optional===true||line?.isOptional===true||/^\s*optional\b/i.test(description(line)));}
function lines(){return Array.isArray(window.state?.quote?.lines)?window.state.quote.lines:[];}
function cleanLabel(value){return text(value).replace(/^\s*optional\s*[—–:\-]+\s*/i,'').replace(/\s*[—–-]\s*owner\s+option(?:al)?\.?\s*$/i,'').replace(/\s*\(owner\s+option(?:al)?\)\s*/ig,' ').replace(/\s+/g,' ').trim();}
function hasDrywall(base){return /\b(drywall|sheet\s*rock|sheetrock)\b/i.test(`${text(window.state?.quote?.scope)} ${base.map(description).join(' ')}`);}
function drywallSf(base){
  const labor=base.filter(line=>/\b(drywall|sheet\s*rock|sheetrock)\b/i.test(description(line))&&/\b(labor|hang|hanging|tape|taping|finish|finishing)\b/i.test(description(line))&&/^(sf|sq\.?\s*ft|square\s*feet?)$/i.test(unit(line)));
  const net=labor.reduce((sum,line)=>sum+quantity(line),0);
  if(net>0)return net;
  const materials=base.filter(line=>/\b(drywall|sheet\s*rock|sheetrock)\b/i.test(description(line))&&/\b(material|board|sheet|panel|gypsum)\b/i.test(description(line))&&/^(sf|sq\.?\s*ft|square\s*feet?)$/i.test(unit(line)));
  const ordered=materials.reduce((sum,line)=>sum+quantity(line),0);
  return ordered>0?Math.round((ordered/1.1)*100)/100:0;
}
function optionList(all,base){
  const result=all.filter(optional).filter(line=>quantity(line)>0&&rate(line)>0).map(line=>({description:cleanLabel(description(line)),quantity:quantity(line),unit:unit(line),rate:rate(line),amount:quantity(line)*rate(line)}));
  const hasPaint=result.some(item=>/\b(prime|paint|painting)\b/i.test(item.description));
  if(!hasPaint&&text(window.state?.businessId)===H38_BUSINESS_ID&&hasDrywall(base)){
    const sf=drywallSf(base);if(sf>0)result.push({...PAINT_OPTION,quantity:sf,amount:sf*PAINT_OPTION.rate});
  }
  const seen=new Set();
  return result.filter(item=>{const key=/\b(prime|paint|painting)\b/i.test(item.description)?'paint':/garage\s*doors?/i.test(item.description)?'garage-door':item.description.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
}
function liveRow(line){const q=quantity(line),r=rate(line);return `<tr><td>${html(description(line)||'Project work')}</td><td>${html(q)}</td><td>${html(unit(line))}</td><td>${money(q*r)}</td></tr>`;}
function optionRow(option,index){return `<label class="h38-customer-option h38-live-option-row"><input type="checkbox" data-h38-live-option="${index}" aria-label="Add ${html(option.description)}"><span class="h38-option-check" aria-hidden="true">✓</span><span class="h38-option-copy"><strong>${html(option.description)}</strong><small>${html(option.quantity)} ${html(option.unit)} × ${money(option.rate)}</small></span><strong class="h38-option-price">${money(option.amount)}</strong></label>`;}
function tax(){
  try{const id=text(window.state?.quote?.quoteId),records=Array.isArray(window.state?.snapshot?.quotes)?window.state.snapshot.quotes:[],record=records.find(row=>text(row?.['Quote ID']||row?.quoteId)===id)||{};return number(record?.Tax??record?.tax);}catch(_){return 0;}
}
function nativePrintAvailable(){return Boolean(window.AndroidH38Native&&typeof window.AndroidH38Native.printCurrentPage==='function'&&window.H38_SAFE_QUOTE_PRINT?.print);}
function updateTotals(section,baseTotal){const selected=Array.from(section.querySelectorAll('input[data-h38-live-option]:checked')).reduce((sum,input)=>sum+number(input.closest('.h38-live-option-row')?.dataset.amount),0);section.querySelector('[data-h38-live-selected]')?.replaceChildren(document.createTextNode(money(selected)));section.querySelector('[data-h38-live-combined]')?.replaceChildren(document.createTextNode(money(baseTotal+selected)));}
function installStyle(){if(document.getElementById('h38LiveQuoteOptionStyle'))return;const style=document.createElement('style');style.id='h38LiveQuoteOptionStyle';style.textContent=`.h38-live-options{margin-top:18px;padding-top:15px;border-top:2px solid #14232f}.h38-live-options h3{margin:0 0 4px}.h38-live-options>p{margin:.2rem 0 10px;color:#66737d}.h38-live-options .h38-customer-option{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:center;padding:11px 0;border-top:1px solid #e2e7eb;cursor:pointer}.h38-live-options .h38-customer-option input{position:absolute;opacity:0}.h38-live-options .h38-option-check{width:23px;height:23px;border:2px solid #0b5f78;border-radius:5px;display:grid;place-items:center;color:transparent;font-weight:900}.h38-live-options .h38-customer-option:has(input:checked) .h38-option-check{background:#0b5f78;color:#fff}.h38-live-options .h38-option-copy{display:flex;flex-direction:column;gap:2px}.h38-live-options .h38-option-copy small{color:#66737d}.h38-live-options .h38-option-price{white-space:nowrap}.h38-live-option-totals{margin:10px 0 0 auto;max-width:370px}.h38-live-option-totals>div{display:flex;justify-content:space-between;gap:14px;padding:4px 0}.h38-live-option-totals .grand{border-top:2px solid #14232f;margin-top:4px;padding-top:8px;font-size:1.08rem}.h38-live-option-note{font-size:.78rem!important;color:#66737d!important}@media(max-width:560px){.h38-live-options .h38-customer-option{grid-template-columns:auto minmax(0,1fr)}.h38-live-options .h38-option-price{grid-column:2}.h38-live-option-totals{max-width:none}}@media print{.h38-live-options .h38-option-check{background:#fff!important;color:transparent!important}.h38-live-options .h38-customer-option:has(input:checked) .h38-option-check{color:#14232f!important}}`;document.head.appendChild(style);}
function decorate(){
  const host=document.getElementById('h38LiveCustomerQuote'),doc=host?.querySelector('.h38-live-document');
  if(!doc||decorating)return;decorating=true;
  try{
    installStyle();
    const all=lines(),base=all.filter(line=>!optional(line)),options=optionList(all,base);
    const tbody=doc.querySelector('tbody');if(tbody)tbody.innerHTML=base.length?base.map(liveRow).join(''):'<tr><td colspan="4">Add project work above to build the proposal.</td></tr>';
    const subtotal=base.reduce((sum,line)=>sum+quantity(line)*rate(line),0),quoteTax=tax(),baseTotal=subtotal+quoteTax;
    const total=doc.querySelector('.h38-live-total');if(total)total.innerHTML=`<span>Base quote total</span><strong>${money(baseTotal)}</strong>`;
    doc.querySelector('.h38-live-options')?.remove();
    if(options.length&&total){const section=document.createElement('section');section.className='h38-live-options';section.innerHTML=`<h3>Optional add-ons</h3><p>These are not included in the base quote. Select any options you would like added.</p><div>${options.map(optionRow).join('')}</div><div class="h38-live-option-totals"><div><span>Selected options</span><strong data-h38-live-selected>${money(0)}</strong></div><div class="grand"><span>Total with selected options</span><strong data-h38-live-combined>${money(baseTotal)}</strong></div></div><p class="h38-live-option-note">Selecting an option requests it for the proposal. It does not authorize work, payment, purchasing or scheduling by itself.</p>`;total.insertAdjacentElement('afterend',section);Array.from(section.querySelectorAll('.h38-live-option-row')).forEach((row,index)=>row.dataset.amount=String(options[index].amount));section.addEventListener('change',event=>{if(event.target?.matches?.('input[data-h38-live-option]'))updateTotals(section,baseTotal);});}
    document.getElementById('h38OwnerClientOptions')?.remove();
    doc.dataset.h38LiveOptionsBuild=BUILD;
  }finally{decorating=false;}
}
function schedule(delay=40){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;decorate();},delay);}
document.addEventListener('input',event=>{if(event.target?.matches?.('#quoteTitle,#quoteScope,#quoteCustomer,[data-line-field]'))schedule(140);});
document.addEventListener('change',event=>{if(event.target?.matches?.('#quoteTitle,#quoteScope,#quoteCustomer,[data-line-field]'))schedule(140);});
document.addEventListener('click',event=>{if(event.target?.closest?.('#addQuoteLine,[data-remove-line],#h38AiQuoteDraftButton'))schedule(220);});
document.addEventListener('click',event=>{const button=event.target?.closest?.('#h38LiveOpenPdf');if(!button||!nativePrintAvailable())return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();decorate();window.H38_SAFE_QUOTE_PRINT.print();},true);
new MutationObserver(mutations=>{const hit=mutations.some(mutation=>Array.from(mutation.addedNodes||[]).some(node=>node.nodeType===1&&(node.id==='h38LiveCustomerQuote'||node.classList?.contains('h38-live-document')||node.querySelector?.('#h38LiveCustomerQuote,.h38-live-document'))));if(hit)schedule(20);}).observe(document.documentElement,{subtree:true,childList:true});
installStyle();schedule(0);
window.H38_LIVE_QUOTE_OPTIONS=Object.freeze({enabled:true,build:BUILD,baseQuoteExcludesOptions:true,paintOptionRate:1.75,customerSelectable:true,nativeLivePrint:true,automaticApproval:false,automaticSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false});
})();
