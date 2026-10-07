(function(){
'use strict';
const BUILD='20261006-review-nudges-1';
const text=v=>String(v==null?'':v).trim();
const state=()=>window.state||{};
const rows=n=>Array.isArray(state()?.snapshot?.[n])?state().snapshot[n]:[];
const val=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const esc=v=>typeof window.esc==='function'?window.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function patchToday(){if(state()?.page!=='today')return;const panel=document.querySelector('.h38-life-today');if(!panel||panel.querySelector('[data-h38-review-nudges]'))return;const comms=window.H38CustomerComms;if(!comms||typeof comms.reviewNudgeCandidates!=='function')return;let due=[];try{due=comms.reviewNudgeCandidates(rows('jobs'),Date.now());}catch(e){return;}if(!due.length)return;const customers=rows('customers');const nameOf=job=>{const c=customers.find(r=>text(val(r,'Customer ID','customerId'))===text(val(job,'Customer ID','customerId')));return text(val(c,'Customer Name','name'))||text(val(job,'Customer Name'))||'Customer';};const box=document.createElement('div');box.className='h38-review-nudges';box.dataset.h38ReviewNudges='1';box.innerHTML=`<div><strong>Review follow-ups</strong><small>${due.length} customer${due.length===1?'':'s'} got a review request a few days ago. One polite nudge often lands the review.</small></div>${due.slice(0,5).map(job=>`<div class="row"><span>${esc(nameOf(job))}</span><button type="button" data-nudge="${esc(text(val(job,'Job ID','jobId')))}">Send nudge</button></div>`).join('')}`;
panel.querySelector('.h38-life-head')?.insertAdjacentElement('afterend',box);
box.querySelectorAll('[data-nudge]').forEach(btn=>btn.onclick=async()=>{btn.disabled=true;try{await comms.sendReviewNudge(btn.dataset.nudge);btn.textContent='Queued ✓';}catch(error){btn.disabled=false;window.toast?.(error.message||String(error),true);}});}
let pending=false;function patch(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;try{patchToday();}catch(e){}});}
function start(){if(!document.documentElement)return;new MutationObserver(patch).observe(document.documentElement,{childList:true,subtree:true});patch();window.H38_REVIEW_NUDGES_RUNTIME=Object.freeze({build:BUILD});}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
})();
