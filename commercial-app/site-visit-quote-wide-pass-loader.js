(function(){
'use strict';
const BUILD='20260821-site-visit-quote-wide-pass-loader-1';
if(window.H38_SITE_VISIT_QUOTE_WIDE_PASS_LOADER)return;
const scripts=[
  ['./quote-runtime-authority.js','20260821-quote-runtime-authority-1','H38_QUOTE_RUNTIME_AUTHORITY'],
  ['./site-visit-quote-handoff-final.js','20260821-site-visit-quote-handoff-final-1','H38_FIELD_VISIT_QUOTE_HANDOFF'],
  ['./measurement-verification-final.js','20260821-measurement-verification-final-1','H38_MEASUREMENT_VERIFICATION_FINAL'],
  ['./site-visit-work-dedupe-final.js','20260821-site-visit-work-dedupe-final-1','H38_SITE_VISIT_WORK_DEDUPE_FINAL'],
  ['./job-followup-idempotency-final.js','20260821-followup-idempotency-final-1','H38_JOB_FOLLOWUP_IDEMPOTENCY_FINAL'],
  ['./quote-action-picture-final.js','20260821-quote-action-picture-final-1','H38_QUOTE_ACTION_PICTURE_FINAL'],
  ['./quote-direction-options.js','20260821-quote-direction-options-1','H38_QUOTE_DIRECTION_OPTIONS']
];
function load(entry){return new Promise((resolve,reject)=>{const[path,build,global]=entry;if(window[global])return resolve();const existing=document.querySelector(`script[data-h38-wide-pass="${global}"]`);if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}const script=document.createElement('script');script.src=`${path}?build=${build}`;script.async=false;script.dataset.h38WidePass=global;script.addEventListener('load',resolve,{once:true});script.addEventListener('error',()=>reject(new Error(`Could not load ${path}`)),{once:true});document.head.appendChild(script);});}
async function boot(){for(const entry of scripts){try{await load(entry);}catch(error){console.error('[H38 wide pass loader]',error);}}window.dispatchEvent(new CustomEvent('h38:site-visit-quote-wide-pass-ready',{detail:{build:BUILD}}));}
window.H38_SITE_VISIT_QUOTE_WIDE_PASS_LOADER=Object.freeze({enabled:true,build:BUILD,scripts:scripts.map(([path,build,global])=>({path,build,global})),legacyLoadsFirst:true,finalAuthoritiesLoadSequentially:true});
void boot();
})();