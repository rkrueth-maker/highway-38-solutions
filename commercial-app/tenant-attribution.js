(function(){
'use strict';
const BUILD='20260913-tenant-attribution-1';
const NORTH_KEY='northern-lakes';
const H38_NAME='Highway 38 Solutions';
const H38_URL='https://highway38solutions.com/';
const text=v=>String(v==null?'':v).trim();
const esc=v=>typeof window.esc==='function'?window.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function requestedKey(){try{return text(new URLSearchParams(location.search).get('businessKey')).toLowerCase();}catch(_){return'';}}
function business(){return window.state?.snapshot?.business||{};}
function businessKey(){const b=business();return text(b.businessKey||b['Business Key']||window.state?.businessKey||requestedKey()).toLowerCase();}
function northern(){return businessKey()===NORTH_KEY;}
function businessName(){const b=business();return text(b.businessName||b.displayName||b['Business Name'])||(northern()?'Northern Lakes Property Maintenance LLC':H38_NAME);}
function shortName(){const b=business(),brand=b.brandConfig&&typeof b.brandConfig==='object'?b.brandConfig:{};return text(brand.shortName)||(northern()?'Northern Lakes':businessName());}
function poweredHtml(){return`Business systems powered by <a href="${H38_URL}" target="_blank" rel="noopener">${H38_NAME}</a>`;}
function installMeetingReportBranding(){
  const NativeBlob=window.Blob;
  if(typeof NativeBlob!=='function'||NativeBlob.__h38TenantAttributionProxy===true)return;
  const WrappedBlob=new Proxy(NativeBlob,{construct(target,args){
    const parts=args[0],options=args[1];
    if(northern()&&Array.isArray(parts)&&parts.length===1&&typeof parts[0]==='string'){
      const raw=parts[0];
      if(raw.includes('— Meeting Report</title>')&&raw.includes('Highway 38 Solutions · Business Office')&&raw.includes('Highway 38 owner approval and date')){
        const credit=`<footer style="margin-top:30px;border-top:1px solid #d3d9de;padding-top:12px;font-size:12px;color:#5b6872">${poweredHtml()}</footer>`;
        const branded=raw
          .replace('Highway 38 Solutions · Business Office',`${esc(businessName())} · Business Office`)
          .replace('Highway 38 owner approval and date',`${esc(shortName())} owner approval and date`)
          .replace('</body>',`${credit}</body>`);
        return Reflect.construct(target,[[branded],options],target);
      }
    }
    return Reflect.construct(target,args,target);
  }});
  try{Object.defineProperty(WrappedBlob,'__h38TenantAttributionProxy',{value:true});}catch(_){}
  window.Blob=WrappedBlob;
}
function enhanceOfficeBrand(){
  if(!northern())return;
  const brand=document.querySelector('.topbar .brand>div,.brand>div');
  if(brand&&!brand.querySelector('[data-h38-powered-by]')){
    const credit=document.createElement('small');credit.dataset.h38PoweredBy='1';credit.className='h38-powered-by-credit';credit.innerHTML=poweredHtml();
    credit.style.cssText='display:block;margin-top:2px;font-size:10px;line-height:1.2;opacity:.72;font-weight:600';
    credit.querySelector('a')?.setAttribute('style','color:inherit;text-decoration:none');brand.appendChild(credit);
  }
}
function neutralizeTenantPrompt(){
  if(!northern())return;
  document.querySelectorAll('[data-h38-prompt="Find customer on Highway 38"]').forEach(button=>{
    button.setAttribute('data-h38-prompt','Find a customer');
    button.textContent='Find a customer';
  });
}
function enhanceQuotePreview(){
  if(!northern())return;
  const footer=document.querySelector('#quotePreviewDocument .quote-document-footer');
  if(!footer||footer.querySelector('[data-h38-powered-by]'))return;
  const credit=document.createElement('span');credit.dataset.h38PoweredBy='1';credit.className='h38-powered-by-credit';credit.innerHTML=poweredHtml();
  credit.style.cssText='display:block;width:100%;margin-top:4px;font-size:10px;opacity:.72';credit.querySelector('a')?.setAttribute('style','color:inherit;text-decoration:none');footer.appendChild(credit);
}
let queued=false;
function enhance(){queued=false;enhanceOfficeBrand();neutralizeTenantPrompt();enhanceQuotePreview();}
function schedule(){if(queued)return;queued=true;if(typeof requestAnimationFrame==='function')requestAnimationFrame(enhance);else setTimeout(enhance,0);}
installMeetingReportBranding();
if(document.body){new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});schedule();}
else document.addEventListener('DOMContentLoaded',()=>{new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});schedule();},{once:true});
window.addEventListener('h38:office-page-rendered',schedule);
window.addEventListener('h38:business-snapshot-updated',schedule);
window.addEventListener('pageshow',schedule);
window.H38_TENANT_ATTRIBUTION=Object.freeze({enabled:true,build:BUILD,provider:H38_NAME,providerUrl:H38_URL,northernOnly:true,meetingReportsTenantAware:true,todayPromptTenantNeutral:true,quoteAttribution:true,officeAttribution:true,enhance});
})();
