(function(){
'use strict';
const BUILD='20260807-1315';
const config=window.H38_CUSTOMER_PORTAL_SUPABASE||{};
let running=false;
let queued=false;
async function decorate(){if(running||!window.H38_CUSTOMER_PORTAL)return;const portal=window.H38_CUSTOMER_PORTAL.getState?.();if(!portal?.client||!portal?.account)return;running=true;try{const{data,error}=await portal.client.from('customer_quotes').select('id,pdf_storage_path,status').eq('customer_id',portal.account.id);if(error)throw error;for(const row of data||[]){const card=document.querySelector(`[data-quote-id="${CSS.escape(row.id)}"]`);if(!card||!row.pdf_storage_path||card.querySelector('[data-quote-pdf]'))continue;const button=document.createElement('button');button.type='button';button.className='btn';button.dataset.quotePdf=row.pdf_storage_path;button.textContent='Open quote PDF';button.addEventListener('click',()=>{const target=window.open('about:blank','_blank');if(target)target.opener=null;void openPdf(portal.client,row.pdf_storage_path,target).catch(error=>{console.error('Quote PDF open failed',error);try{target?.close();}catch(_){}});});card.appendChild(button);}const requested=new URLSearchParams(location.search).get('quote');if(requested){const card=document.querySelector(`[data-quote-id="${CSS.escape(requested)}"]`);if(card){card.classList.add('is-requested-quote');card.scrollIntoView({behavior:'smooth',block:'center'});const review=card.querySelector('[data-review-quote]');if(review)review.focus({preventScroll:true});}}}catch(error){console.error('Quote delivery portal enhancement failed',error);}finally{running=false;if(queued){queued=false;setTimeout(()=>void decorate(),0);}}}
async function openPdf(client,path,target){const{data,error}=await client.storage.from(config.storageBucket||'customer-portal').createSignedUrl(path,300);if(error)throw error;if(!data?.signedUrl)throw new Error('A secure PDF link was not created.');if(target&&!target.closed){target.location.replace(data.signedUrl);return;}window.location.assign(data.signedUrl);}
function schedule(){if(running){queued=true;return;}setTimeout(()=>void decorate(),0);}
window.addEventListener('h38:portal-data',schedule);
window.H38_CUSTOMER_QUOTE_DELIVERY={enabled:true,build:BUILD,privatePdf:true,eventDriven:true,noDocumentMutationPolling:true,openPdf};
})();
