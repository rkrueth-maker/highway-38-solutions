(function(){
'use strict';
// H38 Repair Guide integration — Office-side seams (optional, toggle-gated).
// The standalone Repair Guide app at /repair-guide/ is untouched; its bridge
// (repair-guide/js/office-bridge.js) only activates via ?office_business=.
// Everything here is dormant unless the owner enables "Repair Guide
// integration" in Owner Controls (default OFF).
const BUILD='20261004-repair-guide-1';
const text=v=>String(v==null?'':v).trim();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state=()=>window.state||{};
function isEnabled(){try{return !!(window.H38OwnerControls&&typeof window.H38OwnerControls.isRepairGuideEnabled==='function'&&window.H38OwnerControls.isRepairGuideEnabled());}catch(e){return false;}}
function rows(name){try{if(typeof window.records==='function'){const r=window.records(name);if(Array.isArray(r))return r;}}catch(e){}try{const s=state().snapshot;if(s&&Array.isArray(s[name]))return s[name];}catch(e){}return[];}
function val(row){for(let i=1;i<arguments.length;i++){const k=arguments[i];try{if(typeof v==='function'){const got=v(row,k);if(got!==undefined&&got!==null&&String(got)!=='')return got;}}catch(e){}const got=row?row[k]:undefined;if(got!==undefined&&got!==null&&String(got)!=='')return got;}return '';}
function guideBase(){try{if(window.location&&window.location.hostname&&/highway38solutions\.com$/.test(window.location.hostname))return window.location.origin;}catch(e){}return 'https://highway38solutions.com';}
// Deep link: Office -> Repair Guide (standalone app, new tab). The bridge
// verifies the toggle server-side; the URL param alone never enables it.
function guideUrl(extra){
  const q=new URLSearchParams({office_business:text(state().businessId)});
  const p=extra||{};
  Object.keys(p).forEach(k=>{if(p[k]!==undefined&&p[k]!==null&&String(p[k])!=='')q.set(k,p[k]);});
  return guideBase()+'/repair-guide/?'+q.toString();
}
// Deep link target: Repair Guide -> Office (opens the Office Work page).
function officeUrl(shortcut){return guideBase()+'/commercial-app/?shortcut='+encodeURIComponent(shortcut||'work');}
function rgJobs(){
  return rows('jobs').filter(r=>String(val(r,'Source','source')).toLowerCase()==='repair guide');
}
function diagnosisLink(row){
  const key=val(row,'record_key','recordKey','Record Key');
  if(!key) return '';
  return '<a target="_blank" rel="noopener" href="'+esc(guideUrl({job:key}))+'">🔧 View diagnosis</a>';
}
function hubHtml(){
  const jobs=rgJobs().slice(0,25);
  const head=typeof pageHead==='function'?pageHead('Repair Guide','Diagnoses sent from the standalone Repair Guide app land here as job drafts for owner review.'):'<header class="page-head"><div><h1>Repair Guide</h1></div></header>';
  const how='<section class="card span12"><h2>How it works</h2>'+
    '<ol class="small">'+
    '<li>The Repair Guide stays a separate app — techs keep using it on its own.</li>'+
    '<li>From any diagnosis, tap <strong>🏢 Send to Office</strong> to create a job draft here (and optionally a quote draft).</li>'+
    '<li>Review the draft below, confirm the customer, then work it like any other job.</li>'+
    '</ol>'+
    '<div class="actions"><a target="_blank" rel="noopener" href="'+esc(guideUrl())+'"><button type="button">Open Repair Guide app →</button></a></div>'+
    '<p class="muted small">Nothing is ever sent to a customer automatically. Drafts always need owner review.</p></section>';
  const list=jobs.length?jobs.map(j=>{
    const title=val(j,'Project Title','ProjectTitle')||'Untitled job';
    const num=val(j,'Job Number','JobNumber');
    const st=val(j,'Status','status');
    return '<div class="row"><div class="row-top"><strong>'+esc(title)+'</strong><span class="muted small">'+esc(st)+'</span></div>'+
      '<small>'+esc(num)+'</small><div class="row-actions">'+diagnosisLink(j)+'</div></div>';
  }).join(''):'<p class="muted">No diagnoses have been sent to the Office yet.</p>';
  const drafts='<section class="card span12"><h2>Repair Guide job drafts ('+jobs.length+')</h2><div class="list">'+list+'</div></section>';
  return '<div class="grid">'+head+how+drafts+'</div>';
}
function renderHub(){
  const main=document.getElementById('mainContent');
  if(!main) return;
  main.innerHTML=hubHtml();
  try{if(typeof window.scrollTo==='function')window.scrollTo(0,0);}catch(e){}
  try{const f=document.getElementById('mainContent');if(f&&f.focus)f.focus({preventScroll:true});}catch(e){}
}
// Additive card on the Work page listing Repair Guide drafts with diagnosis links.
function enhanceWorkPage(){
  const main=document.getElementById('mainContent');
  if(!main||main.querySelector('[data-h38-rg-work]')) return;
  const jobs=rgJobs();
  if(!jobs.length) return;
  const grid=main.querySelector('.grid');
  if(!grid) return;
  const sec=document.createElement('section');
  sec.className='card span12';
  sec.setAttribute('data-h38-rg-work','1');
  sec.innerHTML='<h2>🔧 Repair Guide drafts</h2><div class="list">'+jobs.slice(0,10).map(j=>{
    const title=val(j,'Project Title','ProjectTitle')||'Untitled job';
    const st=val(j,'Status','status');
    return '<div class="row"><div class="row-top"><strong>'+esc(title)+'</strong><span class="muted small">'+esc(st)+'</span></div>'+
      '<div class="row-actions">'+diagnosisLink(j)+' <button type="button" class="secondary" data-h38-rg-hub>Open hub</button></div></div>';
  }).join('')+'</div>';
  grid.appendChild(sec);
  sec.querySelectorAll('[data-h38-rg-hub]').forEach(b=>{b.onclick=()=>{if(window.openPage)window.openPage('repair-guide');};});
}
function install(){
  try{
    if(window.PAGE_DEFS&&!window.PAGE_DEFS['repair-guide'])window.PAGE_DEFS['repair-guide']=['🔧','Repair Guide'];
    const baseAllowed=window.allowedPages;
    if(typeof baseAllowed==='function'&&!baseAllowed.__h38RepairGuide){
      const wrapped=function(){const pages=baseAllowed.apply(this,arguments).slice();
        if(isEnabled()&&(state().shell||'office')==='office'&&pages.indexOf('repair-guide')<0){
          const at=Math.max(0,pages.indexOf('work'));
          pages.splice(at,0,'repair-guide');
        }
        return pages;};
      wrapped.__h38RepairGuide=true;
      window.allowedPages=wrapped;
    }
    const baseNav=window.renderNav;
    if(typeof baseNav==='function'&&!baseNav.__h38RepairGuide){
      const wrapped=function(){const result=baseNav.apply(this,arguments);
        try{
          const nav=document.getElementById('mainNav');
          if(isEnabled()&&(state().shell||'office')==='office'&&nav&&!nav.querySelector('[data-page="repair-guide"]')){
            const button=document.createElement('button');
            button.type='button';
            button.dataset.page='repair-guide';
            button.className=state().page==='repair-guide'?'active':'';
            button.innerHTML='<span class="nav-icon">🔧</span><span>Repair Guide</span>';
            button.onclick=function(){if(window.openPage)window.openPage('repair-guide');};
            const workBtn=nav.querySelector('[data-page="work"]');
            if(workBtn)workBtn.insertAdjacentElement('afterend',button);else nav.appendChild(button);
          }
        }catch(e){}
        return result;};
      wrapped.__h38RepairGuide=true;
      window.renderNav=wrapped;
    }
    const baseRender=window.renderPage;
    if(typeof baseRender==='function'&&!baseRender.__h38RepairGuide){
      const wrapped=function(){
        if(isEnabled()&&state().page==='repair-guide'){renderHub();return;}
        const result=baseRender.apply(this,arguments);
        if(isEnabled()&&state().page==='work'){try{enhanceWorkPage();}catch(e){}}
        return result;};
      wrapped.__h38RepairGuide=true;
      window.renderPage=wrapped;
    }
    const baseOpen=window.openPage;
    if(typeof baseOpen==='function'&&!baseOpen.__h38RepairGuide){
      const wrapped=function(page){
        if(isEnabled()&&page==='repair-guide'){
          state().page='repair-guide';
          try{if(window.renderNav)window.renderNav();}catch(e){}
          renderHub();
          try{const f=document.getElementById('mainContent');if(f&&f.focus)f.focus({preventScroll:true});}catch(e){}
          return;
        }
        return baseOpen.apply(this,arguments);};
      wrapped.__h38RepairGuide=true;
      window.openPage=wrapped;
    }
  }catch(e){/* integration must never break the Office shell */}
}
window.H38RepairGuide={
  isEnabled:isEnabled,
  guideUrl:guideUrl,
  officeUrl:officeUrl,
  openGuide:function(extra){try{window.open(guideUrl(extra||{}),'_blank','noopener');}catch(e){}},
  BUILD:BUILD
};
install();
})();
