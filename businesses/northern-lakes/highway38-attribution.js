(function(){
'use strict';
const BUILD='20260913-highway38-attribution-1';
const LABEL='Business systems powered by Highway 38 Solutions';
const URL='https://highway38solutions.com/';
function linkHtml(){return`Business systems powered by <a href="${URL}" target="_blank" rel="noopener">Highway 38 Solutions</a>`;}
function ensureStyle(){if(document.getElementById('nlH38AttributionStyle'))return;const style=document.createElement('style');style.id='nlH38AttributionStyle';style.textContent='.nl-h38-attribution{font:600 12px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:inherit;opacity:.72}.nl-h38-attribution a{color:inherit;text-decoration:none}.nl-h38-attribution a:hover,.nl-h38-attribution a:focus{text-decoration:underline}.nl-h38-attribution-block{text-align:center;padding:14px 16px 24px}';document.head.appendChild(style);}
function ensure(){
  ensureStyle();
  const footer=document.querySelector('.site-footer .footer-bottom');
  if(footer&&!footer.querySelector('[data-h38-powered-by]'))footer.insertAdjacentHTML('beforeend',`<span data-h38-powered-by="1" class="nl-h38-attribution"> · ${linkHtml()}</span>`);
  const portal=document.querySelector('.portal-shell');
  if(portal&&!document.querySelector('[data-h38-powered-by-portal]'))portal.insertAdjacentHTML('afterend',`<div data-h38-powered-by-portal="1" class="nl-h38-attribution nl-h38-attribution-block">${linkHtml()}</div>`);
  const login=document.querySelector('.login-page');
  if(login&&!document.querySelector('[data-h38-powered-by-owner]'))login.insertAdjacentHTML('afterend',`<div data-h38-powered-by-owner="1" class="nl-h38-attribution nl-h38-attribution-block">${linkHtml()}</div>`);
}
let queued=false;
function schedule(){if(queued)return;queued=true;const run=()=>{queued=false;ensure();};if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);}
if(document.body){new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});schedule();}
else document.addEventListener('DOMContentLoaded',()=>{new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});schedule();},{once:true});
window.addEventListener('pageshow',schedule);
window.NL_HIGHWAY38_ATTRIBUTION=Object.freeze({enabled:true,build:BUILD,label:LABEL,url:URL,ensure});
})();
