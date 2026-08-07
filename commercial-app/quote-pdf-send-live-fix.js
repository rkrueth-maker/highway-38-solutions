(function(){
'use strict';
const BUILD='20260806-2245';
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!cfg.enabled||!window.supabase)return;
let refreshing=false;
const text=value=>String(value==null?'':value);
const val=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null)return row[key];}return'';};
function client(){return shared?.ensure?.()||window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},global:{headers:{'x-client-info':'h38-quote-pdf-send-live-fix-v1'}}});}
function status(message,error){
 let node=document.getElementById('h38QuotePdfSendStatus');
 if(!node){const tools=document.querySelector('.page-tools');if(!tools)return;node=document.createElement('div');node.id='h38QuotePdfSendStatus';node.className='notice';node.setAttribute('role','status');node.setAttribute('aria-live','assertive');tools.insertAdjacentElement('afterend',node);}
 node.hidden=false;node.className=`notice${error?' warn':''}`;node.textContent=text(message);
 if(typeof window.toast==='function')window.toast(message,Boolean(error));
}
async function refreshCurrentQuote(){
 if(refreshing)return window.state?.quote||null;
 const quoteId=text(window.state?.quote?.quoteId).trim(),businessId=text(window.state?.businessId).trim();
 if(!quoteId||!businessId)throw new Error('Open a saved quote before previewing or sending.');
 refreshing=true;
 try{
  const api=client();
  const session=await api.auth.getSession();
  if(session.error||!session.data?.session)throw new Error('Sign in again before previewing or sending the quote.');
  const result=await api.from('business_records').select('record_key,payload,updated_at').eq('business_id',businessId).eq('collection','quotes').eq('record_key',quoteId).eq('record_status','active').maybeSingle();
  if(result.error)throw result.error;
  if(!result.data?.payload)throw new Error('The saved quote could not be reloaded.');
  const payload=result.data.payload;
  const quotes=window.state?.snapshot?.quotes;
  if(Array.isArray(quotes)){
   const index=quotes.findIndex(row=>text(val(row,'Quote ID','quoteId'))===quoteId);
   if(index>=0)quotes[index]=payload;else quotes.unshift(payload);
  }
  const current=window.state.quote||{};
  current.quoteId=quoteId;
  current.customerId=text(val(payload,'Customer ID','customerId')||current.customerId);
  current.quoteNumber=text(val(payload,'Quote Number','quoteNumber')||current.quoteNumber);
  current.projectTitle=text(val(payload,'Project Title','projectTitle')||current.projectTitle);
  current.scope=text(val(payload,'Scope','scope')||current.scope);
  current.measurementNotes=text(val(payload,'Measurement Notes','measurementNotes')||current.measurementNotes);
  current.revision=Number(val(payload,'Revision','revision')||current.revision||1);
  current.lines=Array.isArray(val(payload,'lines','Lines','Quote Lines'))?val(payload,'lines','Lines','Quote Lines'):[];
  window.state.quote=current;
  return payload;
 }finally{refreshing=false;}
}
function bindPreview(){
 const button=document.getElementById('previewQuoteButton');
 if(!button||button.dataset.h38CurrentRevisionBound)return;
 button.dataset.h38CurrentRevisionBound='1';
 button.addEventListener('click',async event=>{
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
  button.disabled=true;const original=button.textContent;button.textContent='Refreshing PDF…';
  try{status('Refreshing the exact saved quote revision before opening the PDF preview…',false);await refreshCurrentQuote();if(typeof window.renderQuotePreview!=='function')throw new Error('PDF preview is not loaded.');window.renderQuotePreview();}
  catch(error){status(`${error.message||String(error)} Nothing was sent.`,true);}
  finally{button.disabled=false;button.textContent=original||'Preview / Print PDF';}
 },true);
}
function bindSend(){
 const button=document.getElementById('h38ApproveSendQuoteButton');
 if(!button||button.dataset.h38CurrentRevisionBound)return;
 button.dataset.h38CurrentRevisionBound='1';
 button.addEventListener('click',async event=>{
  if(button.disabled)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
  button.disabled=true;const original=button.textContent;button.textContent='Refreshing quote…';
  try{status('Reloading the exact saved revision before PDF creation and secure delivery…',false);await refreshCurrentQuote();if(typeof window.renderQuotes==='function')window.renderQuotes();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(!window.H38_QUOTE_DELIVERY?.open)throw new Error('Secure quote delivery is not loaded.');await window.H38_QUOTE_DELIVERY.open();}
  catch(error){status(`${error.message||String(error)} Nothing was sent.`,true);}
  finally{const latest=document.getElementById('h38ApproveSendQuoteButton');if(latest&&!latest.disabled){latest.textContent=original||'✉️ Approve & Send Quote';}}
 },true);
}
function bind(){bindPreview();bindSend();}
new MutationObserver(()=>bind()).observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
window.H38_QUOTE_PDF_SEND_LIVE_FIX=Object.freeze({enabled:true,build:BUILD,refreshCurrentQuote,currentRevisionRequired:true,automaticSending:false,ownerConfirmationRequired:true});
})();
