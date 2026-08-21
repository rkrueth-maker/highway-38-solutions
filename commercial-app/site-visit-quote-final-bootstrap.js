(function(){
'use strict';
const BUILD='20260821-site-visit-quote-final-bootstrap-1';
let running=null,lastReason='',lastCompletedAt=0;
const scripts=[
  ['./site-visit-quote-e2e-core.js','20260821-site-visit-quote-e2e-core-1','H38_SITE_VISIT_QUOTE_E2E_CORE'],
  ['./quote-runtime-authority.js','20260821-quote-runtime-authority-reassert-2','H38_QUOTE_RUNTIME_AUTHORITY'],
  ['./site-visit-work-dedupe-final.js','20260821-site-visit-work-dedupe-reassert-3','H38_SITE_VISIT_WORK_DEDUPE_FINAL'],
  ['./site-visit-identity-write-fence-final.js','20260821-site-visit-identity-write-fence-reassert-2','H38_SITE_VISIT_IDENTITY_WRITE_FENCE_FINAL'],
  ['./quote-image-orientation-final.js','20260821-quote-image-orientation-final-1','H38_QUOTE_IMAGE_ORIENTATION_FINAL']
];
function load(entry){return new Promise((resolve,reject)=>{const[path,build,global]=entry,script=document.createElement('script');script.src=`${path}?build=${build}&reassert=${Date.now()}`;script.async=false;script.dataset.h38FinalAuthority=global;script.onload=resolve;script.onerror=()=>reject(new Error(`Could not reassert ${path}`));document.head.appendChild(script);});}
function healthy(){const Bridge=window.H38Bridge;return !!(Bridge?.prototype?.request?.__h38QuoteImageOrientationFinal&&window.H38_QUOTE_RUNTIME_AUTHORITY?.savedQuoteActionPictureAuthority===true&&window.H38_SITE_VISIT_IDENTITY_WRITE_FENCE_FINAL?.linkedQuoteIdentityWriteFence===true&&window.H38_SITE_VISIT_QUOTE_E2E_CORE?.manualRequiredRatesRemainEditable===true);}
async function reassert(reason='startup'){
  if(running)return running;
  running=(async()=>{for(const entry of scripts)await load(entry);lastReason=reason;lastCompletedAt=Date.now();window.dispatchEvent(new CustomEvent('h38:site-visit-quote-final-authorities-ready',{detail:{build:BUILD,reason,lastCompletedAt}}));return healthy();})().catch(error=>{console.error('[H38 final authority bootstrap]',error);return false;}).finally(()=>{running=null;});
  return running;
}
function startup(){void reassert('window-load');}
if(document.readyState==='complete')setTimeout(startup,0);else window.addEventListener('load',startup,{once:true});
window.addEventListener('pageshow',()=>{if(!healthy())void reassert('pageshow-recovery');});
window.H38_SITE_VISIT_QUOTE_FINAL_BOOTSTRAP=Object.freeze({enabled:true,build:BUILD,reassert,healthy,scripts:scripts.map(([path,build,global])=>({path,build,global})),forcesFinalAuthoritiesAfterLegacyScripts:true,physicalAndroidAcceptanceRequired:true,automaticApproval:false,automaticCustomerSending:false});
})();
