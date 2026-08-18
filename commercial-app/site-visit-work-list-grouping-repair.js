(function(){
'use strict';
const BUILD='20260818-work-site-visit-grouping-3-single-authority';
let groupingObserver=null;
let groupingTimer=0;
let renderHookInstalled=false;
const text=value=>String(value==null?'':value).trim();
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const normalize=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const sessionId=row=>text(value(row,'Capture Session ID','captureSessionId','sessionId'));
const sessionTime=row=>text(value(row,'Started Time','startedAt','Created Time','createdAt','Completed Time','completedAt','Updated Time','updatedAt'));
const projectTitle=row=>text(value(row,'Project Title','projectTitle')||'Site Visit');
const quoteId=row=>text(value(row,'Quote ID','quoteId'));
const customerId=row=>text(value(row,'Customer ID','customerId'));
const jobId=row=>text(value(row,'Job ID','jobId'));
const html=value=>typeof window.esc==='function'?window.esc(value):text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function isWorkPage(){return text(window.state?.page)==='work'&&!!document.getElementById('mainContent');}
function collection(name){const rows=window.state?.snapshot?.[name];return Array.isArray(rows)?rows:[];}
function snapshots(){return collection('siteCaptureSessions').filter(row=>sessionId(row)).slice().sort((a,b)=>sessionTime(a).localeCompare(sessionTime(b)));}
function actionButtons(row){return Array.from(row?.querySelectorAll?.('button')||[]);}
function isVisitDomRow(row){
  if(row.closest('.h38-site-visit-group'))return false;
  const labels=actionButtons(row).map(button=>normalize(button.textContent));
  return labels.some(label=>label==='open'||label.includes('open edit'))&&labels.some(label=>label==='delete'||label.startsWith('delete '));
}
function titleForDomRow(row){return normalize(row?.querySelector?.('strong')?.textContent||'');}
function mapRows(){
  const main=document.getElementById('mainContent');
  const domRows=Array.from(main?.querySelectorAll?.('.row')||[]).filter(isVisitDomRow);
  const sessions=snapshots(),used=new Set(),mapped=[];
  for(const row of domRows){
    const hinted=text(row.dataset.h38SiteVisitSessionId);
    const title=titleForDomRow(row);
    let match=hinted?sessions.find(item=>sessionId(item)===hinted&&!used.has(sessionId(item))):null;
    if(!match)match=sessions.find(item=>!used.has(sessionId(item))&&title&&normalize(projectTitle(item))===title);
    if(!match)match=sessions.find(item=>!used.has(sessionId(item))&&title&&(normalize(projectTitle(item)).includes(title)||title.includes(normalize(projectTitle(item)))));
    if(!match)continue;
    const sid=sessionId(match);used.add(sid);row.dataset.h38SiteVisitSessionId=sid;mapped.push({row,session:match});
  }
  return mapped;
}
function jobIdForSession(session){
  const direct=jobId(session);if(direct)return direct;
  const qid=quoteId(session);
  if(qid){
    const quote=collection('quotes').find(row=>quoteId(row)===qid);
    const fromQuote=jobId(quote);if(fromQuote)return fromQuote;
    const quoteCustomer=customerId(quote)||customerId(session),quoteTitle=projectTitle(quote)||projectTitle(session);
    const matchedJob=collection('jobs').find(row=>customerId(row)===quoteCustomer&&normalize(projectTitle(row))===normalize(quoteTitle));
    if(matchedJob&&jobId(matchedJob))return jobId(matchedJob);
  }
  const cid=customerId(session),title=normalize(projectTitle(session));
  const matchedJob=collection('jobs').find(row=>cid&&customerId(row)===cid&&title&&normalize(projectTitle(row))===title);
  return matchedJob?jobId(matchedJob):'';
}
function groupKey(session){const jid=jobIdForSession(session);return jid?`job:${jid}`:`customer:${customerId(session)}|project:${normalize(projectTitle(session))}`;}
function groupMapped(mapped){const groups=new Map();for(const item of mapped){const key=groupKey(item.session);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}return Array.from(groups.values());}
function ensureStyle(){
  if(document.getElementById('h38SiteVisitGroupingStyle'))return;
  const style=document.createElement('style');style.id='h38SiteVisitGroupingStyle';style.textContent=`
  .h38-site-visit-group{border:1px solid var(--line,#d9dee8);border-radius:12px;margin:10px 0;background:var(--card,#fff);overflow:hidden}
  .h38-site-visit-group>summary{cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;font-weight:700;list-style:none}
  .h38-site-visit-group>summary::-webkit-details-marker{display:none}
  .h38-site-visit-group>summary small{font-weight:600;opacity:.72}
  .h38-site-visit-group-body{padding:0 10px 10px}
  .h38-site-visit-group-body>.row{margin-top:8px}
  .h38-site-visit-continuation-label{display:block;font-size:12px;font-weight:700;opacity:.7;margin:0 0 4px}
  `;document.head.appendChild(style);
}
function decorate(){
  if(!isWorkPage())return 0;
  const mapped=mapRows();if(!mapped.length)return 0;
  ensureStyle();let created=0;
  for(const items of groupMapped(mapped)){
    items.sort((a,b)=>sessionTime(a.session).localeCompare(sessionTime(b.session)));
    const first=items[0],parent=first.row.parentElement;if(!parent)continue;
    const details=document.createElement('details');details.className='h38-site-visit-group';details.dataset.h38SiteVisitGroup=groupKey(first.session);
    const continuations=Math.max(0,items.length-1);
    details.innerHTML=`<summary><span>${html(projectTitle(first.session))}</span><small>${continuations?`1 Site Visit + ${continuations} continuation${continuations===1?'':'s'}`:'1 Site Visit'}</small></summary><div class="h38-site-visit-group-body"></div>`;
    parent.insertBefore(details,first.row);
    const body=details.querySelector('.h38-site-visit-group-body');
    items.forEach((item,index)=>{
      item.row.querySelector('.h38-site-visit-continuation-label')?.remove();
      const label=document.createElement('span');label.className='h38-site-visit-continuation-label';label.textContent=index===0?'Original Site Visit':`Continuation ${index}`;
      item.row.insertBefore(label,item.row.firstChild);body.appendChild(item.row);
    });
    created++;
  }
  return created;
}
function stopGroupingWindow(){
  if(groupingObserver){groupingObserver.disconnect();groupingObserver=null;}
  clearTimeout(groupingTimer);groupingTimer=0;
}
function armGroupingWindow(){
  stopGroupingWindow();if(!isWorkPage())return;
  requestAnimationFrame(()=>{
    if(!isWorkPage())return;
    if(decorate()>0)return;
    const main=document.getElementById('mainContent');if(!main)return;
    groupingObserver=new MutationObserver(()=>{if(!isWorkPage()){stopGroupingWindow();return;}if(decorate()>0)stopGroupingWindow();});
    groupingObserver.observe(main,{childList:true,subtree:true});
    groupingTimer=setTimeout(()=>{decorate();stopGroupingWindow();},450);
  });
}
function installRenderHook(){
  const current=window.renderWork;
  if(typeof current!=='function')return false;
  if(current.__h38SiteVisitGroupingRenderHook){renderHookInstalled=true;return true;}
  const wrapped=function(){const result=current.apply(this,arguments);armGroupingWindow();return result;};
  wrapped.__h38SiteVisitGroupingRenderHook=true;
  wrapped.__h38SiteVisitGroupingBase=current;
  window.renderWork=wrapped;renderHookInstalled=true;return true;
}
function install(attempt=0){if(installRenderHook())return;if(attempt<40)setTimeout(()=>install(attempt+1),50);}
install();
setTimeout(()=>{installRenderHook();if(isWorkPage())armGroupingWindow();},0);
document.addEventListener('h38:business-snapshot-updated',()=>{if(isWorkPage())armGroupingWindow();});
window.H38_SITE_VISIT_WORK_LIST_GROUPING_REPAIR=Object.freeze({build:BUILD,oneProjectLevelSiteVisit:true,groupByJobIdentity:true,continuationsNested:true,durableSessionIdentityOnRows:true,singleRenderAuthority:true,permanentWholeDocumentObserver:false,boundedMainContentObserverMs:450,focusRegroup:false,pageshowRegroup:false,storageChanged:false,androidChanged:false,automaticApproval:false,automaticCustomerSending:false,physicalAndroidAcceptanceRequired:true});
})();
