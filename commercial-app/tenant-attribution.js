(function(){
'use strict';
const BUILD='20260926-tenant-attribution-mobile-framing-3-final-training';
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
function installSharedMobileChrome(){
  let style=document.getElementById('h38SharedTenantMobileChrome');
  if(!style){style=document.createElement('style');style.id='h38SharedTenantMobileChrome';document.head.appendChild(style);}
  const css=`@media(max-width:760px){
.topbar{align-items:center!important}
.topbar .brand{min-width:0!important;overflow:visible!important}
.topbar .brand>div{min-width:0!important;max-width:min(250px,62vw)!important}
.topbar .brand strong{display:block!important;max-width:min(220px,56vw)!important;overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important;text-align:left!important;font-size:clamp(12px,3.35vw,15px)!important}
.business-bar{display:flex!important;align-items:center!important;justify-content:center!important;min-width:0!important;overflow:hidden!important;padding-left:10px!important;padding-right:10px!important}
.business-bar span{display:block!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;text-align:center!important}
}`;
  if(style.textContent!==css)style.textContent=css;
}
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
function normalizeMobileBrand(){
  if(!northern())return;
  const strong=document.querySelector('.topbar .brand strong,.brand strong');
  if(!strong)return;
  const mobile=typeof matchMedia==='function'&&matchMedia('(max-width:760px)').matches;
  const desired=mobile?shortName():businessName();
  if(text(strong.textContent)!==desired)strong.textContent=desired;
  strong.setAttribute('title',businessName());
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
function neutralizeAssistantBrand(){
  if(!northern())return;
  const assistant=`${shortName()} Assistant`;
  const launcher=document.getElementById('globalAiButton');
  if(launcher){
    launcher.setAttribute('aria-label',`Open ${assistant}`);
    launcher.setAttribute('title',assistant);
    const label=launcher.querySelector('.h38-floating-assistant-label');
    if(label)label.textContent='Ask Assistant';
  }
  if(window.state?.page==='assistant'){
    const main=document.getElementById('mainContent');
    const heading=main?.querySelector('.page-head h1');
    const intro=main?.querySelector('.page-head p');
    const form=main?.querySelector('#paCommandForm');
    const label=form?.querySelector('label');
    if(heading)heading.textContent=assistant;
    if(intro)intro.textContent='Private to your sign-in. Ask questions, manage personal reminders, or give Business Office commands.';
    if(label)label.textContent='Ask or command your Office';
  }
}
function enhanceQuotePreview(){
  if(!northern())return;
  const footer=document.querySelector('#quotePreviewDocument .quote-document-footer');
  if(!footer||footer.querySelector('[data-h38-powered-by]'))return;
  const credit=document.createElement('span');credit.dataset.h38PoweredBy='1';credit.className='h38-powered-by-credit';credit.innerHTML=poweredHtml();
  credit.style.cssText='display:block;width:100%;margin-top:4px;font-size:10px;opacity:.72';credit.querySelector('a')?.setAttribute('style','color:inherit;text-decoration:none');footer.appendChild(credit);
}
let queued=false;
function enhance(){queued=false;installSharedMobileChrome();normalizeMobileBrand();enhanceOfficeBrand();neutralizeTenantPrompt();neutralizeAssistantBrand();enhanceQuotePreview();}
function schedule(){if(queued)return;queued=true;if(typeof requestAnimationFrame==='function')requestAnimationFrame(enhance);else setTimeout(enhance,0);}
installMeetingReportBranding();
if(document.body){new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});schedule();}
else document.addEventListener('DOMContentLoaded',()=>{new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});schedule();},{once:true});
window.addEventListener('resize',schedule,{passive:true});
window.addEventListener('h38:office-page-rendered',schedule);
window.addEventListener('h38:business-snapshot-updated',schedule);
window.addEventListener('pageshow',schedule);
window.H38_TENANT_ATTRIBUTION=Object.freeze({enabled:true,build:BUILD,provider:H38_NAME,providerUrl:H38_URL,northernOnly:true,meetingReportsTenantAware:true,todayPromptTenantNeutral:true,quoteAttribution:true,officeAttribution:true,sharedMobileChrome:true,mobileShortName:true,assistantTenantAware:true,enhance});
})();
