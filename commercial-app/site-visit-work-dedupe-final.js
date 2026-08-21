(function(){
'use strict';
const BUILD='20260821-site-visit-work-dedupe-final-2';
const C=window.H38_FIELD_VISIT_CORE;
let timer=0,observer=null,observerTarget=null,forcedIdentity=null;
const text=value=>String(value==null?'':value).trim();
const payload=row=>row?.payload&&typeof row.payload==='object'?row.payload:row;
const value=(row,...keys)=>{const source=payload(row);for(const key of keys){if(source&&source[key]!==undefined&&source[key]!==null&&source[key]!=='')return source[key];}return'';};
const normalize=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
const quotes=()=>rows('quotes');
const sessions=()=>rows('siteCaptureSessions').filter(row=>text(value(row,'Capture Session ID','captureSessionId')));
const quoteById=id=>quotes().find(row=>text(value(row,'Quote ID','quoteId'))===text(id))||null;
function serverIdentity(row){
  const sessionId=text(value(row,'Capture Session ID','captureSessionId'));
  const visitId=text(value(row,'Site Visit ID','siteVisitId'));
  const quoteId=text(value(row,'Quote ID','quoteId'));
  const quote=quoteById(quoteId);
  const customerId=text(value(row,'Customer ID','customerId')||value(quote,'Customer ID','customerId'));
  const title=text(value(row,'Project Title','projectTitle')||value(quote,'Project Title','projectTitle'));
  const scope=text(value(row,'Scope','scope')||value(quote,'Scope','scope'));
  return{row,sessionId,visitId,quoteId,customerId,businessId:text(value(row,'Business ID','businessId')||value(quote,'Business ID','businessId')||window.state?.businessId),title:normalize(title),projectTitle:title,scope,projectType:text(value(row,'Project Type','projectType')),status:text(value(row,'Status','status')||'IN_PROGRESS')};
}
function identities(){return sessions().map(serverIdentity);}
function objectClues(row){
  const source=payload(row)||{};
  return{
    sessionId:text(value(source,'Capture Session ID','captureSessionId','sessionId')),
    visitId:text(value(source,'Site Visit ID','siteVisitId','visitId')),
    quoteId:text(value(source,'Quote ID','quoteId')),
    customerId:text(value(source,'Customer ID','customerId')),
    title:normalize(value(source,'Project Title','projectTitle')),
    local:/LOCAL[_ -]?DRAFT/i.test(text(value(source,'Status','status')))||/^LOCAL-/i.test(text(value(source,'Quote Number','quoteNumber')))
  };
}
function compatible(clue,identity){
  if(clue.sessionId&&identity.sessionId!==clue.sessionId)return false;
  if(clue.visitId&&identity.visitId&&identity.visitId!==clue.visitId)return false;
  if(clue.quoteId&&identity.quoteId&&identity.quoteId!==clue.quoteId)return false;
  if(clue.customerId&&identity.customerId&&identity.customerId!==clue.customerId)return false;
  if(clue.title&&identity.title&&identity.title!==clue.title)return false;
  return true;
}
function single(list){return list.length===1?list[0]:null;}
function resolveClues(clue){
  const all=identities();
  if(!all.length)return null;
  if(clue.sessionId)return single(all.filter(identity=>identity.sessionId===clue.sessionId));
  if(clue.visitId){const match=single(all.filter(identity=>identity.visitId&&identity.visitId===clue.visitId));if(match)return match;}
  if(clue.quoteId){const match=single(all.filter(identity=>identity.quoteId&&identity.quoteId===clue.quoteId&&compatible(clue,identity)));if(match)return match;}
  if(clue.customerId&&clue.title){const match=single(all.filter(identity=>identity.customerId===clue.customerId&&identity.title===clue.title&&compatible(clue,identity)));if(match)return match;}
  if(clue.title){const match=single(all.filter(identity=>identity.title===clue.title&&compatible(clue,identity)));if(match)return match;}
  return null;
}
function resolve(row){return resolveClues(objectClues(row));}
function sameLogical(local,identity){const clue=objectClues(local);if(clue.sessionId||clue.visitId||clue.quoteId||clue.customerId)return compatible(clue,identity);return !!clue.title&&clue.title===identity.title;}
function canonicalVisit(local,identity){
  const seed=local&&sameLogical(local,identity)?local:(typeof C?.blank==='function'?C.blank():{});
  return Object.assign({},seed,{
    businessId:identity.businessId||text(seed?.businessId),
    sessionId:identity.sessionId||text(seed?.sessionId),
    visitId:identity.visitId||text(seed?.visitId),
    quoteId:identity.quoteId||text(seed?.quoteId),
    customerId:identity.customerId||text(seed?.customerId),
    projectTitle:identity.projectTitle||text(seed?.projectTitle),
    projectType:identity.projectType||text(seed?.projectType),
    scope:identity.scope||text(seed?.scope),
    status:identity.status||text(seed?.status)||'IN_PROGRESS'
  });
}
function installRestoreAuthority(){
  if(!C||typeof C.restore!=='function'||C.restore.__h38SiteVisitIdentityAuthority)return false;
  const base=C.restore;
  const wrapped=async function(){
    const local=await base.apply(this,arguments);
    const identity=forcedIdentity||resolve(local||{});
    if(!identity)return local;
    return canonicalVisit(local,identity);
  };
  wrapped.__h38SiteVisitIdentityAuthority=true;
  wrapped.__h38SiteVisitIdentityBase=base;
  C.restore=wrapped;
  return true;
}
function installOpenAuthority(){
  const api=window.H38_FIELD_VISIT;
  if(!api||typeof api.open!=='function'||api.open.__h38SiteVisitIdentityAuthority)return false;
  installRestoreAuthority();
  const base=api.open;
  const wrapped=async function(opts={}){
    const identity=resolve(opts)||resolve(C?.state?.visit||{});
    if(!identity)return base.apply(this,arguments);
    forcedIdentity=identity;
    try{return await base.call(this,Object.assign({},opts,{captureSessionId:identity.sessionId,sessionId:identity.sessionId,siteVisitId:identity.visitId,visitId:identity.visitId,quoteId:identity.quoteId,customerId:identity.customerId,projectTitle:identity.projectTitle,scope:identity.scope}));}
    finally{forcedIdentity=null;}
  };
  wrapped.__h38SiteVisitIdentityAuthority=true;
  wrapped.__h38SiteVisitIdentityBase=base;
  api.open=wrapped;
  return true;
}
function isWork(){return text(window.state?.page)==='work'&&!!document.getElementById('mainContent');}
function openLabel(button){return normalize(button?.textContent);}
function isOpenButton(button){const label=openLabel(button);return label==='open'||label==='open edit'||label.startsWith('open edit ');}
function isVisitRow(row){const buttons=Array.from(row?.querySelectorAll?.('button')||[]);return buttons.some(isOpenButton)&&buttons.some(button=>{const label=normalize(button.textContent);return label==='delete'||label.startsWith('delete ');});}
function extractId(raw,prefix){const match=text(raw).match(new RegExp(`\\b${prefix}-[A-Z0-9-]{8,}\\b`,'i'));return match?match[0]:'';}
function rowClues(row){
  const buttons=Array.from(row.querySelectorAll('button'));
  const dataset=[row,...buttons].reduce((out,node)=>Object.assign(out,node?.dataset||{}),{});
  const raw=text(row.textContent);
  const strongs=Array.from(row.querySelectorAll('strong')).map(node=>text(node.textContent)).filter(Boolean);
  const title=strongs.find(item=>!/^(local[_ -]?draft|attached_to_|in_progress|draft|closed|complete)/i.test(item))||strongs[0]||'';
  return{
    sessionId:text(dataset.h38SiteVisitSessionId||dataset.captureSessionId||dataset.sessionId||extractId(raw,'SCAN')),
    visitId:text(dataset.siteVisitId||dataset.visitId||extractId(raw,'VISIT')),
    quoteId:text(dataset.quoteId||extractId(raw,'QUOTE')),
    customerId:text(dataset.customerId||extractId(raw,'CUSTOMER')),
    title:normalize(title),
    raw,
    local:/\bLOCAL[_ -]?DRAFT\b/i.test(raw)||/\blocal draft\b/i.test(raw)
  };
}
function resolveRow(row){return resolveClues(rowClues(row));}
function score(item){let result=0;if(item.clue.sessionId&&item.clue.sessionId===item.identity.sessionId)result+=100;if(item.clue.visitId&&item.clue.visitId===item.identity.visitId)result+=40;if(item.clue.quoteId&&item.clue.quoteId===item.identity.quoteId)result+=20;if(!item.clue.local)result+=10;return result;}
function reconcile(){
  clearTimeout(timer);timer=0;
  installOpenAuthority();
  if(!isWork())return 0;
  const main=document.getElementById('mainContent');
  const visitRows=Array.from(main.querySelectorAll('.row')).filter(isVisitRow);
  if(!visitRows.length)return 0;
  const mapped=visitRows.map(row=>{const clue=rowClues(row),identity=resolveClues(clue);return{row,clue,identity};}).filter(item=>item.identity);
  const groups=new Map();
  for(const item of mapped){const key=item.identity.sessionId;if(!key)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
  let removed=0;
  for(const items of groups.values()){
    if(items.length<2)continue;
    items.sort((a,b)=>score(b)-score(a));
    const keep=items[0];keep.row.dataset.h38LogicalSiteVisit='canonical';keep.row.dataset.h38CanonicalSessionId=keep.identity.sessionId;
    for(const duplicate of items.slice(1)){
      if(!duplicate.row.isConnected)continue;
      duplicate.row.remove();removed++;
    }
  }
  return removed;
}
function schedule(delay=40){clearTimeout(timer);timer=setTimeout(reconcile,delay);}
function arm(){
  installOpenAuthority();
  if(!isWork()){if(observer){observer.disconnect();observer=null;observerTarget=null;}return;}
  const main=document.getElementById('mainContent');if(!main)return;
  if(observer&&observerTarget===main){schedule(0);return;}
  if(observer)observer.disconnect();
  observerTarget=main;observer=new MutationObserver(()=>schedule(35));observer.observe(main,{childList:true,subtree:true});schedule(0);
}
function interceptOpen(event){
  const button=event.target instanceof Element?event.target.closest('button'):null;
  if(!button||!isOpenButton(button))return;
  const row=button.closest('.row');if(!row||!isVisitRow(row))return;
  const identity=resolveRow(row);if(!identity)return;
  const api=window.H38_FIELD_VISIT;if(!api?.open)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  void api.open({captureSessionId:identity.sessionId,sessionId:identity.sessionId,siteVisitId:identity.visitId,visitId:identity.visitId,quoteId:identity.quoteId,customerId:identity.customerId,projectTitle:identity.projectTitle,scope:identity.scope});
}
document.addEventListener('click',interceptOpen,true);
if(typeof window.renderWork==='function'&&!window.renderWork.__h38LogicalSiteVisitDedupe){const base=window.renderWork;const wrapped=function(){const result=base.apply(this,arguments);setTimeout(arm,0);return result;};wrapped.__h38LogicalSiteVisitDedupe=true;window.renderWork=wrapped;}
window.addEventListener('h38:business-snapshot-updated',()=>{installOpenAuthority();if(isWork())arm();});
window.addEventListener('h38:auth-cleared',()=>{forcedIdentity=null;});
[0,120,350,900,1800,3600].forEach(delay=>setTimeout(()=>{installRestoreAuthority();installOpenAuthority();if(isWork())arm();},delay));
window.H38_SITE_VISIT_IDENTITY_AUTHORITY=Object.freeze({enabled:true,build:BUILD,resolve,resolveClues,identityPriority:['Capture Session ID','Site Visit ID','unique Quote ID','Customer ID + exact Project Title','unique exact Project Title'],titleOnlyRequiresUniqueServerSession:true,conflictingIdentifiersBlockFallback:true,openCanonicalizedBeforeRestore:true,serverEvidenceNeverDeleted:true,genuineDifferentServerSessionsPreserved:true,persistentJobsObserver:true,automaticApproval:false,automaticCustomerSending:false});
window.H38_SITE_VISIT_WORK_DEDUPE_FINAL=Object.freeze({enabled:true,build:BUILD,identityAuthority:true,localDraftReconcilesWithServer:true,genuineDifferentServerSessionsPreserved:true,domOnlyNoEvidenceDeletion:true,persistentObserver:true,automaticApproval:false,automaticCustomerSending:false});
})();