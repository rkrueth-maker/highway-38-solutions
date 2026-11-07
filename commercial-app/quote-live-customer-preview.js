(function(){
'use strict';
/* Gap7 — split-screen quote builder with live document preview.
 *
 * The preview in the builder is NOT a lookalike: it renders through the
 * canonical customer quote document builder
 * (window.H38_QUOTE_DOCUMENT_BUILDER in supabase-client-quote-branding.js)
 * — the exact same template the Customer Quote Preview screen and the
 * quote PDF/print source use, fed with the builder's in-progress state.
 * If that builder is not loaded, the preview says so instead of showing
 * a mock that could drift from the real document.
 *
 * Layout: on desktop the builder grid becomes a split — editor left,
 * preview right, side by side. On phone (and other narrow widths) the
 * split does not fit, so an Edit / Preview switch flips between the
 * editor and the exact customer document; flipping only toggles CSS —
 * no re-render of the editor — so in-progress edits are never lost.
 *
 * Performance: no startup requests, no page-wide MutationObserver. The
 * preview refreshes from the builder's own lifecycle: delegated
 * input/change/click listeners for builder fields, a wrap of the
 * canonical renderQuotes, and the snapshot-updated event. Re-renders
 * are animation-frame debounced. The preview NEVER saves anything. */
const BUILD='20261107-gap7-splitbuilder-1';
const text=v=>String(v==null?'':v);
let scheduled=false,visualRun=0,actionObjectUrl='';
function findQuoteDraftCard(){const customer=document.getElementById('quoteCustomer');if(!customer)return null;let node=customer.closest('section.card');return node||customer.parentElement;}
function previewHtml(){
  const builder=window.H38_QUOTE_DOCUMENT_BUILDER;
  const toolbar=`<div class="h38-live-preview-toolbar"><div><strong>Customer quote — live preview</strong><span>This is the exact document your customer receives — it updates while you edit.</span></div><button id="h38LiveOpenPdf" type="button">Open / Print PDF</button></div>`;
  if(!builder||typeof builder.buildLiveHtml!=='function'){
    return toolbar+`<div class="notice warn" data-live-preview-unavailable="true">The customer document preview is loading. If it does not appear, open Customer Preview from the saved quote — the live preview never shows a stand-in document.</div>`;
  }
  return toolbar+builder.buildLiveHtml()+`<div id="h38LiveVisuals" class="h38-live-visuals" hidden></div>`;
}
function ensure(){const draft=findQuoteDraftCard();if(!draft)return null;document.getElementById('previewQuoteButton')?.remove();let host=document.getElementById('h38LiveCustomerQuote');if(!host){host=document.createElement('section');host.id='h38LiveCustomerQuote';host.className='card span12 h38-live-customer-quote';host.dataset.liveCustomerQuote='true';draft.insertAdjacentElement('afterend',host);}else if(host.parentElement!==draft.parentElement){draft.insertAdjacentElement('afterend',host);}return host;}
function bindPdf(){const button=document.getElementById('h38LiveOpenPdf');if(!button||button.dataset.bound==='true')return;button.dataset.bound='true';button.addEventListener('click',()=>{const open=window.H38_QUOTE_FINAL_PHONE_FIX?.openPdf;if(typeof open==='function')void open();else window.toast?.('PDF control is not ready yet.',true);});}
function existingRenderUrl(){const figures=[...document.querySelectorAll('.quote-render-images figure,.quote-concept-grid figure')].filter(figure=>!figure.closest('#h38LiveCustomerQuote'));for(const figure of figures){const caption=text(figure.querySelector('figcaption')?.textContent).toLowerCase();if(!/(render|after|proposed|completed)/.test(caption)||/(before|original)/.test(caption))continue;const src=figure.querySelector('img')?.src;if(src)return src;}return'';}
async function updateVisuals(){const run=++visualRun,node=document.getElementById('h38LiveVisuals');if(!node)return;let actionUrl='',renderUrl=existingRenderUrl();try{const flat=await window.H38_MANUAL_IMAGE_CONTROLS?.getFlattenedSelectedBlob?.();if(flat?.blob){if(actionObjectUrl)URL.revokeObjectURL(actionObjectUrl);actionObjectUrl=URL.createObjectURL(flat.blob);actionUrl=actionObjectUrl;}}catch(_){actionUrl='';}if(run!==visualRun||!document.getElementById('h38LiveVisuals'))return;const parts=[];if(actionUrl)parts.push(`<figure><img src="${actionUrl}" alt="Selected project photo"><figcaption>Project photo</figcaption></figure>`);if(renderUrl&&renderUrl!==actionUrl)parts.push(`<figure><img src="${renderUrl}" alt="Proposed project visualization"><figcaption>Proposed visualization</figcaption></figure>`);node.innerHTML=parts.join('');node.hidden=!parts.length;}
let phoneView='form';
function syncToggle(grid){const t=document.getElementById('h38BuilderViewToggle');if(!t)return;const v=grid?.dataset?.h38PhoneView||phoneView;t.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.h38View===v)));}
function ensureSplit(host){const draft=findQuoteDraftCard();const grid=draft?draft.parentElement:host.parentElement;if(!grid||!grid.classList)return;if(host.parentElement&&host.parentElement!==grid)host.parentElement.classList.remove('h38-builder-split');grid.classList.add('h38-builder-split');if(!grid.dataset.h38PhoneView)grid.dataset.h38PhoneView=phoneView;let toggle=document.getElementById('h38BuilderViewToggle');if(!toggle){toggle=document.createElement('div');toggle.id='h38BuilderViewToggle';toggle.className='h38-builder-view-toggle';toggle.setAttribute('role','group');toggle.setAttribute('aria-label','Switch between editing the quote and previewing the customer document');toggle.innerHTML='<button type="button" data-h38-view="form">✏️ Edit</button><button type="button" data-h38-view="preview">👁 Preview — what the customer sees</button>';host.insertAdjacentElement('beforebegin',toggle);toggle.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{phoneView=b.dataset.h38View;grid.dataset.h38PhoneView=phoneView;syncToggle(grid);if(phoneView==='preview')schedule();window.scrollTo({top:0,behavior:'smooth'});}));}syncToggle(grid);}
function update(){const host=ensure();if(!host)return;host.innerHTML=previewHtml();bindPdf();ensureSplit(host);void updateVisuals();}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;update();});}
/* Builder lifecycle hooks — all scoped to the quote builder's own fields
   and actions, never a page-wide observer. */
document.addEventListener('input',event=>{if(event.target?.closest?.('#h38LiveCustomerQuote'))return;if(event.target?.matches?.('#quoteTitle,#quoteScope,#quoteMeasurements,#quoteCustomer,[data-line-field],[data-tier-line-field],[data-tier-name],[data-tier-desc],[data-tier-line-cost-field]'))schedule();});
document.addEventListener('change',event=>{if(event.target?.matches?.('#quoteCustomer,#quoteTitle,#quoteScope,#quoteMeasurements,[data-line-field],[data-tier-line-field],[data-tier-line-cost-field]'))schedule();});
document.addEventListener('click',event=>{if(event.target?.closest?.('#h38LiveCustomerQuote'))return;if(event.target?.closest?.('#addQuoteLine,[data-remove-line],[data-catalog-add],[data-use-price],[data-h38-use-action],[data-h38-rotate-left],[data-h38-rotate-right],[data-h38-rotate-reset],[data-render-generate],[data-tier-add],[data-tier-remove],[data-tier-copy],[data-tier-use],#tierModeSingle,#tierModeTiers'))setTimeout(schedule,80);if(event.target?.closest?.('[data-qps-save],[data-qps-clear]'))setTimeout(schedule,1500);if(event.target?.closest?.('#saveQuoteButton'))setTimeout(schedule,1200);});
window.addEventListener('h38:business-snapshot-updated',()=>{if(document.getElementById('quoteCustomer'))schedule();});
/* The builder re-renders through the canonical renderQuotes; refresh the
   preview right after each builder render (this replaces the old
   page-wide MutationObserver). */
if(typeof window.renderQuotes==='function'&&!window.renderQuotes.__h38LivePreviewWrapped){const baseRenderQuotes=window.renderQuotes;const wrapped=function(){const out=baseRenderQuotes.apply(this,arguments);setTimeout(schedule,0);return out;};wrapped.__h38LivePreviewWrapped=true;window.renderQuotes=wrapped;}
const style=document.createElement('style');style.textContent=`.h38-live-customer-quote{grid-column:1/-1}.h38-live-preview-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.h38-live-preview-toolbar div{display:flex;flex-direction:column;gap:2px}.h38-live-preview-toolbar span{font-size:.88rem;color:#5d6b78}#h38LiveCustomerQuote .quote-document{max-width:none;box-shadow:none}#h38LiveCustomerQuote .quote-table{min-width:0;font-size:.92rem}#h38LiveCustomerQuote .quote-document-body{padding:20px}#h38LiveCustomerQuote .quote-document-header{padding:18px 20px}.h38-live-visuals{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}.h38-live-visuals figure{margin:0}.h38-live-visuals img{display:block;width:100%;max-height:360px;object-fit:contain;background:#eef2f4;border-radius:8px}.h38-live-visuals figcaption{font-size:.78rem;color:#66737d;margin-top:5px}@media(max-width:640px){.h38-live-preview-toolbar{align-items:stretch;flex-direction:column}.h38-live-preview-toolbar button{width:100%}.h38-live-visuals{grid-template-columns:1fr}}.h38-builder-view-toggle{display:none}@media(min-width:1051px){.h38-builder-split>.card.span7{grid-row:1/span 2}.h38-builder-split>.h38-live-customer-quote{grid-column:8/-1;grid-row:1;align-self:start}.h38-builder-split>.h38-wide-rail{grid-column:8/-1;grid-row:2;align-self:start}}@media(max-width:1050px){.h38-builder-view-toggle{display:flex;gap:8px;grid-column:1/-1}.h38-builder-view-toggle button{flex:1;padding:9px}.h38-builder-view-toggle button[aria-pressed="true"]{background:#0b5f78;color:#fff;border-color:#0b5f78}.h38-builder-split[data-h38-phone-view="form"]>.h38-live-customer-quote{display:none}.h38-builder-split[data-h38-phone-view="preview"]>.card.span7,.h38-builder-split[data-h38-phone-view="preview"]>.h38-wide-rail{display:none}}.h38-builder-split>*{min-width:0}.h38-live-customer-quote{min-width:0}`;
document.head.appendChild(style);
setTimeout(schedule,0);
window.H38_LIVE_CUSTOMER_QUOTE=Object.freeze({enabled:true,build:BUILD,liveWhileEditing:true,canonicalDocumentBuilder:true,separatePreviewRequired:false,automaticSending:false,refresh:schedule});
})();
