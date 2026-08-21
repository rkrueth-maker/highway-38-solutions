(function(){
'use strict';
const BUILD='20260821-site-visit-work-dedupe-final-1';
let timer=0,observer=null;
const text=value=>String(value==null?'':value).trim();
const value=(row,...keys)=>{const source=row?.payload&&typeof row.payload==='object'?row.payload:row;for(const key of keys){if(source&&source[key]!==undefined&&source[key]!==null&&source[key]!=='')return source[key];}return'';};
const normalize=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const sessions=()=>Array.isArray(window.state?.snapshot?.siteCaptureSessions)?window.state.snapshot.siteCaptureSessions.filter(row=>text(value(row,'Capture Session ID','captureSessionId'))):[];
function serverIdentity(row){return{sessionId:text(value(row,'Capture Session ID','captureSessionId')),visitId:text(value(row,'Site Visit ID','siteVisitId')),quoteId:text(value(row,'Quote ID','quoteId')),customerId:text(value(row,'Customer ID','customerId')),title:normalize(value(row,'Project Title','projectTitle'))};}
function isWork(){return text(window.state?.page)==='work'&&!!document.getElementById('mainContent');}
function isVisitRow(row){const labels=Array.from(row?.querySelectorAll?.('button')||[]).map(button=>normalize(button.textContent));return labels.some(label=>label==='open'||label.includes('open edit'))&&labels.some(label=>label==='delete'||label.startsWith('delete '));}
function clues(row){const buttons=Array.from(row.querySelectorAll('button')),dataset=[row,...buttons].reduce((out,node)=>Object.assign(out,node?.dataset||{}),{}),raw=text(row.textContent),strong=text(row.querySelector('strong')?.textContent);return{sessionId:text(dataset.h38SiteVisitSessionId||dataset.captureSessionId||dataset.sessionId),visitId:text(dataset.siteVisitId||dataset.visitId),quoteId:text(dataset.quoteId),customerId:text(dataset.customerId),title:normalize(strong),raw,local:/\blocal[_ -]?draft\b/i.test(raw)||/\blocal draft\b/i.test(raw)};}
function match(identity,rowClues){if(rowClues.sessionId&&identity.sessionId===rowClues.sessionId)return{rank:4,key:`session:${identity.sessionId}`};if(rowClues.visitId&&identity.visitId&&identity.visitId===rowClues.visitId)return{rank:3,key:`visit:${identity.visitId}`};if(rowClues.quoteId&&identity.quoteId&&identity.quoteId===rowClues.quoteId)return{rank:2,key:`quote:${identity.quoteId}`};if(rowClues.customerId&&identity.customerId===rowClues.customerId&&rowClues.title&&identity.title===rowClues.title)return{rank:1,key:`fallback:${identity.customerId}|${identity.title}`};if(rowClues.title&&identity.title===rowClues.title)return{rank:0,key:`title:${identity.title}`};return null;}
function reconcile(){
  clearTimeout(timer);timer=0;if(!isWork())return 0;
  const main=document.getElementById('mainContent'),identities=sessions().map(serverIdentity),rows=Array.from(main.querySelectorAll('.row')).filter(isVisitRow);if(!rows.length||!identities.length)return 0;
  const mapped=[];
  for(const row of rows){const c=clues(row),matches=identities.map(identity=>({identity,match:match(identity,c)})).filter(item=>item.match).sort((a,b)=>b.match.rank-a.match.rank);mapped.push({row,c,identity:matches[0]?.identity||null,rank:matches[0]?.match?.rank??-1});}
  let removed=0;const groups=new Map();
  for(const item of mapped){if(!item.identity)continue;const key=item.identity.sessionId?`session:${item.identity.sessionId}`:item.identity.visitId?`visit:${item.identity.visitId}`:item.identity.quoteId?`quote:${item.identity.quoteId}`:`fallback:${item.identity.customerId}|${item.identity.title}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
  for(const items of groups.values()){
    if(items.length<2)continue;
    items.sort((a,b)=>{const aServer=a.c.sessionId&&a.c.sessionId===a.identity.sessionId?1:0,bServer=b.c.sessionId&&b.c.sessionId===b.identity.sessionId?1:0;if(aServer!==bServer)return bServer-aServer;if(a.c.local!==b.c.local)return a.c.local?1:-1;return b.rank-a.rank;});
    const keep=items[0];keep.row.dataset.h38LogicalSiteVisit='canonical';
    for(const duplicate of items.slice(1)){if(duplicate.c.sessionId&&duplicate.c.sessionId!==duplicate.identity.sessionId)continue;if(!duplicate.c.local&&!(!duplicate.c.sessionId&&duplicate.rank<=1))continue;duplicate.row.remove();removed++;}
  }
  const byFallback=new Map();
  for(const item of mapped){if(!item.identity||item.row.dataset.h38LogicalSiteVisit==='canonical'||!item.row.isConnected)continue;const key=item.identity.quoteId?`quote:${item.identity.quoteId}`:`fallback:${item.identity.customerId}|${item.identity.title}`;if(!byFallback.has(key))byFallback.set(key,[]);byFallback.get(key).push(item);}
  for(const items of byFallback.values()){
    const serverSessions=new Set(items.map(item=>item.identity.sessionId).filter(Boolean));if(serverSessions.size!==1)continue;
    const serverRow=items.find(item=>item.c.sessionId&&item.c.sessionId===item.identity.sessionId);if(!serverRow)continue;
    for(const duplicate of items){if(duplicate===serverRow||!duplicate.row.isConnected)continue;if(duplicate.c.local||!duplicate.c.sessionId){duplicate.row.remove();removed++;}}
  }
  return removed;
}
function schedule(delay=60){clearTimeout(timer);timer=setTimeout(reconcile,delay);}
function arm(){if(observer)observer.disconnect();if(!isWork())return;const main=document.getElementById('mainContent');if(!main)return;observer=new MutationObserver(()=>schedule(40));observer.observe(main,{childList:true,subtree:true});schedule(0);setTimeout(()=>{reconcile();observer?.disconnect();observer=null;},1200);}
if(typeof window.renderWork==='function'&&!window.renderWork.__h38LogicalSiteVisitDedupe){const base=window.renderWork;const wrapped=function(){const result=base.apply(this,arguments);setTimeout(arm,0);return result;};wrapped.__h38LogicalSiteVisitDedupe=true;window.renderWork=wrapped;}
window.addEventListener('h38:business-snapshot-updated',()=>{if(isWork())arm();});
[0,250,900].forEach(delay=>setTimeout(()=>{if(isWork())arm();},delay));
window.H38_SITE_VISIT_WORK_DEDUPE_FINAL=Object.freeze({enabled:true,build:BUILD,identityPriority:['Capture Session ID','Site Visit ID','Quote ID','Customer ID + exact Project Title'],localDraftReconcilesWithServer:true,genuineDifferentServerSessionsPreserved:true,domOnlyNoEvidenceDeletion:true,boundedObserver:true,automaticApproval:false,automaticCustomerSending:false});
})();